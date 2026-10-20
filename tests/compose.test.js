import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { catalogTrees, composeEnabled, composeUiId, markdownOf, splitComposeUiId, validateComposition, COMPOSE_LIMITS } from '../src/compose/compose.js'
import { createComposeTool, COMPOSE_FIELDS, COMPOSE_TOOL } from '../src/tools/compose.js'
import { collectUis } from '../src/catalog/patch.js'
import { createPatchTool, PATCH_TOOL } from '../src/tools/patch.js'
import { RENDER_TOOL } from '../src/tools/render.js'
import { guidanceText } from '../src/guidance.js'
import { uiPrompt } from '../src/commands.js'

const config = resolveConfig({})
const tool = createComposeTool(config)
const tree = { root: 'r', components: [{ id: 'r', type: 'Chart', props: { kind: 'bar', labels: ['Q1'], series: [{ name: 'S', values: [1] }] } }] }
const widget = { html: '<div id="x"></div>', css: '#x{}', jsFunctions: 'function go(){}', jsExpressions: ['go()'] }
const blocks = () => [
  { id: 'intro', type: 'markdown', text: '## Recommendation\n\nStart with the local option.' },
  { id: 'chart', type: 'catalog', title: 'Comparison', ...tree },
  { id: 'more', type: 'markdown', text: 'Risks and costs follow.' },
  { id: 'sim', type: 'widget', title: 'Simulator', ...widget },
]

describe('ui_compose validation', () => {
  it('accepts ordered markdown, catalog and widget blocks with their own validation', () => {
    const result = validateComposition({ title: 'Plan', blocks: blocks() }, config)
    expect(result.ok).toBe(true)
    expect(result.blocks.map(b => [b.id, b.type])).toEqual([['intro', 'markdown'], ['chart', 'catalog'], ['more', 'markdown'], ['sim', 'widget']])
    expect(result.stats).toMatchObject({ markdown: 2, catalog: 1, widget: 1, components: 1 })
    expect(result.errors).toEqual([])
  })

  it('reports the exact block and field of every problem', () => {
    const errors = validateComposition({ blocks: [
      { id: 'a', type: 'markdown', text: 'x' },
      { id: 'a', type: 'markdown', text: 'y' },
      { id: 'bad id', type: 'markdown', text: 'x' },
      { id: 'blank', type: 'markdown', text: '   ' },
      { id: 'html', type: 'html', text: 'x' },
      { id: 'c', type: 'catalog', root: 'r', components: [{ id: 'r', type: 'Nope' }] },
      { id: 'w', type: 'widget', html: '<script>alert(1)</script>' },
      { id: 'extra', type: 'markdown', text: 'x', css: 'a{}' },
    ] }, config)
    expect(errors.ok).toBe(false)
    const joined = errors.errors.join('\n')
    expect(joined).toMatch(/blocks\[1\]\.id: duplicate block id "a"/)
    expect(joined).toMatch(/blocks\[2\]\.id: .*must start with a letter/)
    expect(joined).toMatch(/blocks\[3\]\(blank\)\.text: must not be blank/)
    expect(joined).toMatch(/blocks\[4\]\.type: expected one of markdown \| catalog \| widget/)
    expect(joined).toMatch(/blocks\[5\]\(c\)\.components\[0\]\(r\)\.props: unknown component type "Nope"/)
    expect(joined).toMatch(/blocks\[6\]\(w\)\.html: must not contain <script>/)
    expect(joined).toMatch(/blocks\[7\]\(extra\)\.css: unknown field for a markdown block/)
    expect(errors.blocks).toEqual([])
  })

  it('refuses disabled capabilities, empty, oversized and malformed input', () => {
    const catalogDisabled = validateComposition({ blocks: [{ id: 'c', type: 'catalog', ...tree }] }, config, { requireCatalog: false })
    expect(catalogDisabled.errors.join()).toMatch(/catalog blocks are disabled/)
    const widgetDisabled = validateComposition({ blocks: [{ id: 'w', type: 'widget', ...widget }] }, config, { requireWidget: false })
    expect(widgetDisabled.errors.join()).toMatch(/widget blocks are disabled/)
    expect(validateComposition({ blocks: [] }, config).errors.join()).toMatch(/non-empty ordered array/)
    expect(validateComposition({ blocks: Array.from({ length: COMPOSE_LIMITS.blocks + 1 }, (_, i) => ({ id: `b${i}`, type: 'markdown', text: 'x' })) }, config).errors.join()).toMatch(/more than/)
    expect(validateComposition({ blocks: [{ id: 'big', type: 'markdown', text: 'x'.repeat(COMPOSE_LIMITS.markdownChars + 1) }] }, config).errors.join()).toMatch(/at most/)
    expect(validateComposition({ title: 'T', blocks: blocks(), extra: 1 }, config).errors.join()).toMatch(/extra: unknown field/)
    expect(validateComposition('nope', config).errors).toEqual(['arguments: expected object'])
    expect(validateComposition({ blocks: [{ id: 'w', type: 'widget', ...widget, html: 'x'.repeat(400001) }] }, config).errors.join()).toMatch(/limit is/)
  })

  it('keeps block identities stable and derived from the call', () => {
    expect(composeUiId('call-1', 'chart')).toBe('call-1#chart')
    expect(splitComposeUiId('call-1#chart')).toEqual(['call-1', 'chart'])
    expect(splitComposeUiId('call-1')).toBeUndefined()
    expect(splitComposeUiId('call-1#')).toBeUndefined()
    expect(splitComposeUiId(42)).toBeUndefined()
    const result = validateComposition({ blocks: blocks() }, config)
    expect(catalogTrees(result.blocks, 'call-1')).toEqual([{ blockId: 'chart', uiId: 'call-1#chart', tree: { root: 'r', components: tree.components, title: 'Comparison' } }])
    expect(markdownOf(result.blocks)).toBe('## Recommendation\n\nStart with the local option.\n\n[UI: Comparison]\n\nRisks and costs follow.\n\n[Widget: Simulator]')
  })
})

describe('ui_compose tool', () => {
  it('declares title then blocks, inside the DSH JSON-schema subset', () => {
    expect(tool.name).toBe(COMPOSE_TOOL)
    expect(Object.keys(tool.parameters.properties)).toEqual(COMPOSE_FIELDS)
    expect(tool.parameters.required).toEqual(['blocks'])
    expect(JSON.stringify(tool.parameters)).not.toMatch(/\$ref|anyOf|allOf/)
  })

  it('acknowledges a valid composition and names the patchable block UIs', async () => {
    const value = await tool.execute({ title: 'Plan', blocks: blocks() }, { callId: 'call-9' })
    expect(value.ok).toBe(true)
    expect(value.summary).toMatch(/"Plan" is now displayed in order \(4 blocks: 2 prose block\(s\); 1 native UI block\(s\), 1 component\(s\); 1 widget block\(s\)\)/)
    expect(value.summary).toContain('call-9#chart (version 1)')
    expect(tool.output.render({}, value)[0].text).toBe(value.summary)
    expect(tool.output.presentationMeta({}, { ok: true, summary: '' })).toMatchObject({ ok: true })
  })

  it('returns ok=false with fixable errors instead of throwing', async () => {
    const value = await tool.execute({ blocks: [{ id: 'c', type: 'catalog', root: 'r', components: [] }] })
    expect(value.ok).toBe(false)
    expect(value.summary).toMatch(/Composition not shown: 1 problem\(s\)/)
    expect(value.errors.join()).toMatch(/components: expected a non-empty array/)
    expect(tool.output.render({}, value)[0].text).toMatch(/- blocks\[0\]/)
  })

  it('describes only the enabled block kinds', () => {
    const catalogOnly = createComposeTool(resolveConfig({ enableWidget: false })).description
    expect(catalogOnly).toMatch(/Only catalog blocks are enabled/)
    expect(catalogOnly).not.toMatch(/- widget \{/)
    const widgetOnly = createComposeTool(resolveConfig({ enableCatalog: false })).description
    expect(widgetOnly).toMatch(/Only widget blocks are enabled/)
    expect(widgetOnly).not.toMatch(/- catalog \{/)
  })

  it('is registered only when composing is enabled and something can be composed', () => {
    expect(composeEnabled(resolveConfig({}))).toBe(true)
    expect(composeEnabled(resolveConfig({ enableCompose: false }))).toBe(false)
    expect(composeEnabled(resolveConfig({ enableCatalog: false, enableWidget: false }))).toBe(false)
  })
})

describe('ui_patch over composition blocks', () => {
  const messages = () => [
    { role: 'user', content: [{ type: 'text', text: 'compare' }] },
    { role: 'assistant', content: [{ type: 'tool-call', id: 'comp-1', name: COMPOSE_TOOL, arguments: JSON.stringify({ blocks: blocks() }) }] },
    { role: 'tool', toolCallId: 'comp-1', content: [{ type: 'text', text: 'Composed answer is now displayed in order.' }] },
  ]

  it('exposes catalog blocks as version-1 UIs and ignores refused compositions', async () => {
    const uis = collectUis(messages(), { render: RENDER_TOOL, patch: PATCH_TOOL, compose: COMPOSE_TOOL, config })
    expect([...uis.keys()]).toEqual(['comp-1#chart'])
    expect(uis.get('comp-1#chart')).toMatchObject({ version: 1, root: 'r', title: 'Comparison' })
    const refused = messages()
    refused[1].content[0].arguments = JSON.stringify({ blocks: [{ id: 'c', type: 'catalog', root: 'r', components: [] }] })
    expect(collectUis(refused, { render: RENDER_TOOL, patch: PATCH_TOOL, compose: COMPOSE_TOOL, config }).size).toBe(0)
    // Without the compose capability the same history yields nothing.
    expect(collectUis(messages(), { render: RENDER_TOOL, patch: PATCH_TOOL }).size).toBe(0)
    const disabled = resolveConfig({ enableWidget: false })
    const value = await createComposeTool(disabled).execute({ blocks: blocks() }, { callId: 'comp-1' })
    expect(value.ok).toBe(false)
    const declined = messages()
    declined[2].content = tool.output.render({}, value)
    const patchArgs = { uiId: 'comp-1#chart', baseVersion: 1, ops: [{ op: 'setProps', id: 'r', props: { kind: 'line' } }] }
    const exec = { agent: { session: { deriveMessages: () => declined } } }
    expect((await createPatchTool(disabled).execute(patchArgs, exec)).ok).toBe(false)
    // Enabling widgets later cannot turn the earlier refusal into a success.
    expect((await createPatchTool(config).execute(patchArgs, exec)).ok).toBe(false)
    expect(collectUis(messages(), { render: RENDER_TOOL, patch: PATCH_TOOL, compose: COMPOSE_TOOL, config: disabled }).size).toBe(0)
  })

  it('patches one block in place and reports the next version', async () => {
    const patchTool = createPatchTool(config)
    const exec = { callId: 'p1', agent: { session: { deriveMessages: messages } } }
    const value = await patchTool.execute({
      uiId: 'comp-1#chart', baseVersion: 1,
      ops: [{ op: 'setProps', id: 'r', props: { kind: 'line' } }],
    }, exec)
    expect(value.ok).toBe(true)
    expect(value.summary).toMatch(/now version 2/)
    expect(value.ui.components[0].props.kind).toBe('line')
    // A patch addressed to another composition's block id does not resolve.
    const unknown = await patchTool.execute({ uiId: 'other#chart', baseVersion: 1, ops: [{ op: 'setProps', id: 'r', props: { kind: 'bar' } }] }, exec)
    expect(unknown.ok).toBe(false)
    expect(unknown.code).toBe('unknown')
    // A stale base version is refused without changing anything.
    const applied = { uiId: 'comp-1#chart', baseVersion: 1, ops: [{ op: 'setProps', id: 'r', props: { kind: 'line' } }] }
    const patchedHistory = () => [
      ...messages(),
      { role: 'assistant', content: [{ type: 'tool-call', id: 'p1', name: PATCH_TOOL, arguments: JSON.stringify(applied) }] },
      { role: 'tool', toolCallId: 'p1', content: [] },
    ]
    const after = { callId: 'p2', agent: { session: { deriveMessages: patchedHistory } } }
    const stale = await patchTool.execute({ uiId: 'comp-1#chart', baseVersion: 1, ops: [{ op: 'setProps', id: 'r', props: { kind: 'bar' } }] }, after)
    expect(stale.ok).toBe(false)
    expect(stale.code).toBe('stale')
  })
})

describe('compose guidance', () => {
  it('routes prose+UI answers to the composition and keeps dashboards terse', () => {
    const text = guidanceText({ enableCatalog: true, enableWidget: true })
    expect(text).toMatch(/ui_compose/)
    expect(text).toMatch(/analysis followed only by a closing Choice/)
    expect(text).toMatch(/never shorten the reasoning to fit a card/)
    expect(guidanceText({ enableCatalog: true, enableWidget: true, enableCompose: false })).not.toMatch(/ui_compose/)
    expect(uiPrompt('show x', { enableCatalog: true, enableWidget: true })).toMatch(/ui_compose/)
  })
})
