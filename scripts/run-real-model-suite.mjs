// Real-model Generative UI evaluation: one command, three separately reported layers.
//
//   mock     scripts/e2e/run-all.mjs — real DSH Web + Chrome, *scripted* model answers
//   api      real DeepSeek model + the plugin's real tools, no browser (scripts/eval/api-stage.mjs)
//   browser  real DeepSeek model inside real DSH Web + Chrome (scripts/eval/browser-stage.mjs)
//
// Usage: node scripts/run-real-model-suite.mjs [all|A|B|C|D] [--stage all|mock,api,browser]
//          [--only B3,D2,R-chart] [--repeat N] [--record] [--out dir] [--report file.json]
//   A category letter selects API cases and implies --stage api (the old behaviour).
//   --rescore re-judges the last API run from its saved transcripts (<out>/api) with the
//   current assertions, without calling the model; implies --stage api --keep-other-layers.
//   --append (with --only and --keep-other-layers) adds the rerun as extra runs of those cases
//   instead of replacing them: more samples, never a do-over that hides a failure.
//   --keep-other-layers keeps the layers this run did not execute from the existing report
//   (only when its prompt version matches); each layer keeps its own testedAt.
// Env:   DEEPSEEK_API_KEY (required for api/browser), DEEPSEEK_EVAL_MODEL (default deepseek-flash)
// Exit:  0 only when every executed case passed; 1 on any failure, error or missing prerequisite.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { callChatDetailed, getApiKey, MODEL, pluginTools, PROMPT_VERSION } from './test-real-model.mjs'
import { ASSERTION_VERSION } from './eval/assertions.mjs'
import { API_GROUPS, runApiStage } from './eval/api-stage.mjs'
import { assertNoSecrets, redact, summarize, timing, toMarkdown } from './eval/report.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
const valued = new Set(['--stage', '--only', '--repeat', '--out', '--report', '--dsh-home'])
const positional = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]))
const category = positional[0] || 'all'
const STAGES = ['mock', 'api', 'browser']
const HISTORY = [{ file: 'docs/history/2026-10-10-real-model-eval-report.json', note: 'historical snapshot from the v2 evaluator (API only). Its 15/15 is not a pass rate: B3 had no Chart; other cases cannot be rescored because arguments were not kept.' }]

function options() {
  if (![...API_GROUPS, 'all'].includes(category)) throw new Error('Category must be A, B, C, D or all')
  const stageArg = argv.includes('--rescore') ? 'api' : arg('--stage', category === 'all' ? 'all' : 'api')
  const stages = stageArg === 'all' ? STAGES : stageArg.split(',')
  if (!stages.length || stages.some(s => !STAGES.includes(s))) throw new Error(`--stage must be all or a comma list of ${STAGES.join(', ')}`)
  const repeat = Number(arg('--repeat', 1))
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) throw new Error('--repeat must be an integer from 1 to 20')
  const reportPath = path.resolve(arg('--report', 'docs/real-model-eval-report.json'))
  return {
    stages, repeat, reportPath,
    groups: category === 'all' ? API_GROUPS : [category],
    only: arg('--only')?.split(',').map(s => s.trim()).filter(Boolean),
    record: argv.includes('--record'),
    out: path.resolve(arg('--out', path.join(root, 'e2e-shots', 'real-model'))),
  }
}

/** p50/p95 of each stage's timing metrics. */
function stageTiming(stage, cases) {
  if (stage === 'api') return { apiCallMs: timing(cases.flatMap(c => c.timing?.apiCallsMs ?? [])), caseMs: timing(cases.map(c => c.timing?.caseMs)) }
  return {
    firstPreviewMs: timing(cases.map(c => c.timing?.firstPreviewMs)),
    generationMs: timing(cases.map(c => c.timing?.generationMs)),
    browserExecMs: timing(cases.map(c => c.timing?.browserExecMs)),
  }
}

function mockLayer(report, executed) {
  if (!fs.existsSync(report)) return { skipped: 'no mock E2E report found' }
  const r = JSON.parse(fs.readFileSync(report, 'utf8'))
  const cases = r.results.map(x => ({ id: x.name.split('.')[0], title: x.name, category: 'mock', passed: x.ok, reason: x.ok ? null : x.detail }))
  return {
    source: executed ? 'executed in this run (scripts/e2e/run-all.mjs)' : `${path.relative(root, report).replace(/\\/g, '/')} (not re-run; see its date)`,
    testedAt: r.at, model: r.model, summary: summarize(cases), failures: cases.filter(c => !c.passed),
  }
}

async function main() {
  const opts = options()
  const rescore = argv.includes('--rescore')
  const needsKey = !rescore && opts.stages.some(s => s !== 'mock')
  const key = needsKey ? getApiKey() : undefined
  const started = new Date()
  const layers = {}
  const environment = { node: process.versions.node, platform: `${process.platform}-${process.arch}`, plugin: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version }
  fs.mkdirSync(opts.out, { recursive: true })
  console.log(`Real-model evaluation · model ${MODEL} · stages ${opts.stages.join(', ')} · ${rescore ? 'rescoring saved transcripts (no model calls)' : `repeat ${opts.repeat}`}`)

  if (opts.stages.includes('mock')) {
    console.log('\n=== Mock E2E (scripted model) ===')
    const { run } = await import('./e2e/dsh-web.mjs')
    const mockOut = path.join(opts.out, 'mock')
    const r = run(process.execPath, [path.join(root, 'scripts/e2e/run-all.mjs'), '--out', mockOut], { check: false })
    const report = path.join(mockOut, 'e2e-report.json')
    layers.mockE2E = fs.existsSync(report) ? mockLayer(report, true) : { skipped: `mock E2E did not produce a report (exit ${r.status})`, failed: true }
    if (fs.existsSync(report) && !arg('--report')) fs.copyFileSync(report, path.join(root, 'docs/e2e-report.json'))
  } else {
    layers.mockE2E = mockLayer(path.join(root, 'docs/e2e-report.json'), false)
  }

  if (opts.stages.includes('api')) {
    console.log('\n=== Real model · API structural assertions ===')
    let replay
    if (rescore) {
      const prior = fs.existsSync(opts.reportPath) ? JSON.parse(fs.readFileSync(opts.reportPath, 'utf8')) : {}
      if (prior.versions?.prompt !== PROMPT_VERSION || !prior.layers?.api?.cases?.length) throw new Error('--rescore needs a report with an API layer from the same prompt version')
      replay = new Map(prior.layers.api.cases.map(c => [`${c.id}-${c.run}`, c]))
      opts.repeat = Math.max(...prior.layers.api.cases.map(c => c.run))
      layers.api = { testedAt: prior.layers.api.testedAt, rescoredAt: new Date().toISOString() }
    }
    const cases = await runApiStage({ chat: callChatDetailed, tools: pluginTools, groups: opts.groups, ids: opts.only, repeat: opts.repeat, transcripts: path.join(opts.out, 'api'), replay })
    layers.api = {
      testedAt: new Date().toISOString(),
      ...layers.api,
      scope: 'Real model + the plugin\'s real tool definitions and execute(); no browser. Tool choice, first-attempt argument validity, rendered components and data.',
      summary: summarize(cases),
      timing: stageTiming('api', cases),
      cases,
    }
  }

  if (opts.stages.includes('browser')) {
    console.log('\n=== Real model · browser runtime (DSH Web + Chrome) ===')
    const { runBrowserStage } = await import('./eval/browser-stage.mjs')
    const result = await runBrowserStage({ model: MODEL, out: opts.out, only: opts.only, record: opts.record, dshHome: arg('--dsh-home') })
    environment.dsh = result.dsh
    environment.browser = result.browser
    layers.browser = result.skipped ? { skipped: result.skipped, failed: true } : {
      testedAt: new Date().toISOString(),
      scope: 'Real model inside real DSH Web with this plugin, driven in Chrome. Rendering, interaction round trips, stop/resume, network conditions and console errors.',
      summary: summarize(result.cases),
      timing: stageTiming('browser', result.cases),
      cases: result.cases,
    }
  }

  const command = `node scripts/run-real-model-suite.mjs ${argv.join(' ')}`.trim()
  const reported = [...new Set([...(layers.api?.cases ?? []), ...(layers.browser?.cases ?? [])].flatMap(c => c.model ?? []))]
  const fingerprints = [...new Set((layers.api?.cases ?? []).flatMap(c => c.fingerprint ?? []))]
  const previous = fs.existsSync(opts.reportPath) ? (() => { try { return JSON.parse(fs.readFileSync(opts.reportPath, 'utf8')) } catch { return {} } })() : {}
  if ((rescore || argv.includes('--keep-other-layers')) && previous.versions?.prompt === PROMPT_VERSION) {
    for (const stage of ['api', 'browser']) {
      const before = previous.layers?.[stage]
      if (!before?.cases) continue
      if (!opts.stages.includes(stage)) layers[stage] = { ...before, carriedOver: true }
      else if (opts.only && layers[stage]?.cases && !rescore) {
        // A partial rerun replaces only its own cases; the rest keep their earlier results and dates.
        const append = argv.includes('--append')
        const rerun = new Set(layers[stage].cases.map(c => c.id))
        const runs = id => Math.max(0, ...before.cases.filter(c => c.id === id).map(c => c.run ?? 1))
        const kept = before.cases.filter(c => append || !rerun.has(c.id)).map(c => ({ ...c, run: c.run ?? 1, testedAt: c.testedAt ?? before.testedAt }))
        const added = layers[stage].cases.map(c => ({ ...c, run: append ? runs(c.id) + (c.run ?? 1) : c.run ?? 1, testedAt: layers[stage].testedAt }))
        const cases = [...kept, ...added]
        const order = new Map(before.cases.map((c, i) => [`${c.id}-${c.run ?? 1}`, i]))
        const ids = [...new Set(before.cases.map(c => c.id))]
        cases.sort((a, b) => (ids.indexOf(a.id) - ids.indexOf(b.id)) || (a.run - b.run) || ((order.get(`${a.id}-${a.run}`) ?? 0) - (order.get(`${b.id}-${b.run}`) ?? 0)))
        layers[stage] = { ...layers[stage], testedAt: before.testedAt, partialRerunAt: layers[stage].testedAt, summary: summarize(cases), timing: stageTiming(stage, cases), cases }
      }
    }
    if (!opts.stages.includes('mock') && previous.layers?.mockE2E?.summary) layers.mockE2E = { ...previous.layers.mockE2E, carriedOver: true }
    if (!opts.stages.includes('browser') && previous.environment) Object.assign(environment, { dsh: previous.environment.dsh, browser: previous.environment.browser })
  }
  // Every invocation that contributed to this report, oldest first.
  const carried = Object.values(layers).some(l => l?.carriedOver) || (rescore || argv.includes('--keep-other-layers')) && previous.versions?.prompt === PROMPT_VERSION
  const provenance = [...(carried ? previous.provenance ?? (previous.command ? [{ command: previous.command, at: previous.generatedAt }] : []) : []), { command, at: started.toISOString() }]
  const report = redact({
    reportVersion: 3,
    generatedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    command,
    provenance,
    model: { requested: MODEL, reported, fingerprints },
    versions: { assertions: ASSERTION_VERSION, prompt: PROMPT_VERSION },
    environment,
    layers,
    // Human review is recorded by hand after looking at the screenshots; keep it while those screenshots stay.
    // A re-run browser layer has new screenshots, so an earlier review no longer applies.
    manualReview: previous.versions?.prompt === PROMPT_VERSION && !opts.stages.includes('browser') ? previous.manualReview ?? [] : [],
    history: HISTORY,
  }, [key])
  const json = JSON.stringify(report, null, 2)
  const markdown = toMarkdown(report)
  assertNoSecrets(json + markdown, [key])
  fs.mkdirSync(path.dirname(opts.reportPath), { recursive: true })
  fs.writeFileSync(opts.reportPath, json + '\n', 'utf8')
  fs.writeFileSync(opts.reportPath.replace(/-report\.json$|\.json$/, '.md'), markdown, 'utf8')

  const executed = ['api', 'browser'].filter(s => opts.stages.includes(s)).map(s => layers[s])
  if (opts.stages.includes('mock')) executed.push(layers.mockE2E)
  const failed = executed.some(l => l.failed || (l.summary && (l.summary.failed > 0 || l.summary.infrastructureErrors > 0)))
  console.log('\n=== Summary ===')
  for (const [name, l] of Object.entries(layers)) console.log(`${name.padEnd(8)} ${l.skipped ? `not run — ${l.skipped}` : `${l.summary.passed}/${l.summary.total} passed${l.source ? ` (${l.source})` : ''}`}`)
  console.log(`Report: ${path.relative(root, opts.reportPath)} (+ .md)`)
  process.exitCode = failed ? 1 : 0
}

main().catch(err => { console.error(err.message); process.exitCode = 1 })
