// Report assembly for the real-model evaluation: statistics, redaction and a
// Markdown rendering. Nothing here talks to the network.
import os from 'node:os'

/** Nearest-rank percentile of the finite numbers in `values` (undefined when empty). */
export function percentile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!xs.length) return undefined
  return xs[Math.min(xs.length - 1, Math.max(0, Math.ceil((p / 100) * xs.length) - 1))]
}

/** { n, p50, p95, max } of one timing metric across cases. */
export function timing(values) {
  const xs = values.filter(Number.isFinite)
  return { n: xs.length, p50: percentile(xs, 50), p95: percentile(xs, 95), max: xs.length ? Math.max(...xs) : undefined }
}

/**
 * Pass counts per layer and per category; a case counts once per run.
 * Infrastructure errors (quota, outages) are counted apart: the model was not
 * measured, so they are neither passes nor model failures in the success rate.
 */
export function summarize(all) {
  const cases = all.filter(c => !c.infrastructure)
  const infrastructureErrors = all.length - cases.length
  const byCategory = {}
  for (const c of cases) {
    const s = (byCategory[c.category] ??= { total: 0, passed: 0 })
    s.total++
    if (c.passed) s.passed++
  }
  for (const s of Object.values(byCategory)) s.successRate = s.total ? +(s.passed / s.total).toFixed(3) : 0
  const passed = cases.filter(c => c.passed).length
  return { total: cases.length, passed, failed: cases.length - passed, successRate: cases.length ? +(passed / cases.length).toFixed(3) : 0, ...(infrastructureErrors ? { infrastructureErrors } : {}), byCategory }
}

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(Bearer)\s+[A-Za-z0-9._-]{12,}/gi,
  /([?&](?:token|key|api_key)=)[^&\s"']+/gi,
]

/**
 * Remove credentials, URL tokens and local user paths from every string in `value`.
 * @param {string[]} secrets - exact values to remove (e.g. the API key in use).
 */
export function redact(value, secrets = []) {
  const known = secrets.filter(s => typeof s === 'string' && s.length >= 8)
  const home = os.homedir()
  const scrub = s => {
    for (const secret of known) s = s.split(secret).join('[redacted]')
    s = s.replace(SECRET_PATTERNS[0], '[redacted]').replace(SECRET_PATTERNS[1], '$1 [redacted]').replace(SECRET_PATTERNS[2], '$1[redacted]')
    if (home.length > 3) s = s.split(home).join('~').split(home.replace(/\\/g, '/')).join('~')
    return s
  }
  const walk = v => {
    if (typeof v === 'string') return scrub(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value)
}

/** Throw rather than write a report that still contains a secret. */
export function assertNoSecrets(text, secrets = []) {
  const leaked = secrets.some(s => typeof s === 'string' && s.length >= 8 && text.includes(s)) || /\bsk-[A-Za-z0-9_-]{16,}/.test(text)
  if (leaked) throw new Error('Refusing to write the report: it still contains a credential.')
}

const ms = v => (v === undefined ? '–' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`)
const pct = r => `${Math.round(r * 100)}%`
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** Human-readable companion to the JSON report. */
export function toMarkdown(report) {
  const { layers } = report
  const lines = [
    '# Real-model Generative UI evaluation',
    '',
    `> ${report.provenance?.length > 1 ? 'Last updated' : 'Generated'} by \`${report.command}\` on **${report.generatedAt.slice(0, 10)}** · model **${report.model.requested}**` +
      `${report.model.reported?.length ? ` (API reports ${report.model.reported.join(', ')})` : ''} · assertions v${report.versions.assertions} · prompt ${report.versions.prompt}` +
      `${report.environment.dsh ? ` · DSH ${report.environment.dsh}` : ''}`,
    '',
    ...(report.provenance?.length > 1 ? ['Built from these invocations (oldest first):', '', ...report.provenance.map(p => `- \`${p.command}\` · ${p.at.slice(0, 16).replace('T', ' ')} UTC${p.note ? ` — ${p.note}` : ''}`), ''] : []),
    'Three separately measured layers. A pass in one layer is not evidence for another:',
    '',
    '| Layer | What it proves | Result |',
    '| --- | --- | --- |',
  ]
  const row = (name, what, l) => lines.push(`| ${name} | ${what} | ${l ? (l.skipped ? `not run (${cell(l.skipped)})` : `**${l.summary.passed}/${l.summary.total}** (${pct(l.summary.successRate)})${l.summary.infrastructureErrors ? ` + ${l.summary.infrastructureErrors} not measured (infrastructure errors)` : ''}${l.testedAt ? ` · ${l.testedAt.slice(0, 10)}` : ''}${l.carriedOver ? ' (kept from an earlier run)' : ''}`) : 'not run'} |`)
  row('Mock E2E', 'Rendering, streaming, interaction, persistence and isolation with **scripted** model answers', layers.mockE2E)
  row('Real model · API', 'The real model picks the right tool, emits valid arguments and the requested components/data', layers.api)
  row('Real model · browser', 'What the real model generated actually renders and works in real DSH Web + Chrome', layers.browser)
  // A manual review can overturn an automated pass; say so next to the number.
  const overturned = (report.manualReview || []).filter(r => /^fail/.test(r.verdict) && layers.browser?.cases?.some(c => c.id === r.id.split(' ')[0] && c.passed))
  if (overturned.length) lines[lines.length - 1] = lines.at(-1).replace(/ \|$/, ` · **manual review: ${overturned.length} more failed** (${overturned.map(r => r.id).join(', ')}) |`)
  lines.push('')

  for (const [key, title] of [['api', 'Real model · API structural assertions'], ['browser', 'Real model · browser runtime']]) {
    const l = layers[key]
    if (!l || l.skipped) continue
    lines.push(`## ${title}`, '')
    const t = l.timing ?? {}
    if (key === 'api') lines.push(`API time per model call: p50 ${ms(t.apiCallMs?.p50)} · p95 ${ms(t.apiCallMs?.p95)} · per case p50 ${ms(t.caseMs?.p50)} · p95 ${ms(t.caseMs?.p95)} (n=${t.caseMs?.n})${t.caseTokens?.n ? ` · tokens per case p50 ${t.caseTokens.p50} · p95 ${t.caseTokens.p95}` : ''}`, '')
    else lines.push(`First visible preview: p50 ${ms(t.firstPreviewMs?.p50)} · p95 ${ms(t.firstPreviewMs?.p95)} · complete generation: p50 ${ms(t.generationMs?.p50)} · p95 ${ms(t.generationMs?.p95)} · browser execution after the stream: p50 ${ms(t.browserExecMs?.p50)} · p95 ${ms(t.browserExecMs?.p95)}`, '')
    lines.push('| Category | Passed | Rate |', '| --- | --- | --- |')
    for (const [cat, s] of Object.entries(l.summary.byCategory)) lines.push(`| ${cat} | ${s.passed}/${s.total} | ${pct(s.successRate)} |`)
    lines.push('', key === 'api'
      ? '| Case | Category | Result | Tool | Schema (1st try) | API time | Failure reason |'
      : '| Case | Category | Result | First preview | Generated | Browser exec | Console errors | Failure reason / notes |')
    lines.push(key === 'api' ? '| --- | --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const c of l.cases) {
      const id = `${c.id}${c.run > 1 ? ` #${c.run}` : ''} ${cell(c.title)}`
      if (key === 'api') lines.push(`| ${id} | ${c.category} | ${c.passed ? '✅' : '❌'} | ${cell(c.tool?.actual?.join(' → ') || 'none')} | ${c.schema?.firstAttemptValid === false ? `❌${c.schema.recovered ? ' (recovered)' : ''}` : '✅'} | ${ms(c.timing?.apiMs)} | ${cell(c.reason)} |`)
      else lines.push(`| ${id} | ${c.category} | ${c.passed ? '✅' : '❌'} | ${ms(c.timing?.firstPreviewMs)} | ${ms(c.timing?.generationMs)} | ${ms(c.timing?.browserExecMs)} | ${c.consoleErrors?.length ?? 0} | ${cell([c.reason, c.clarifications?.length ? `model asked first: “${c.clarifications[0]}” (answered: use sample data)` : '', c.subagents ? `agent used ${c.subagents} sub-agent(s) to research first` : '', ...(c.notes || [])].filter(Boolean).join(' · '))} |`)
    }
    lines.push('')
  }

  if (report.manualReview?.length) {
    lines.push('## Sampled manual review', '', 'Automated checks cannot judge visual quality. These cases were inspected by looking at the screenshots:', '', '| Case | Screenshot | Verdict | Notes |', '| --- | --- | --- | --- |')
    for (const r of report.manualReview) lines.push(`| ${r.id} | ${r.screenshot ? `[${r.screenshot.split('/').pop()}](${r.screenshot})` : '–'} | ${r.verdict} | ${cell(r.notes)} |`)
    lines.push('')
  }
  lines.push('## History', '')
  for (const h of report.history || []) lines.push(`- [${h.file}](${h.file.replace(/^docs\//, '')}) — ${h.note}`)
  lines.push('')
  return lines.join('\n')
}
