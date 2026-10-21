// Turn-level scoring shared by the API scenarios: which UI a turn touched and
// whether it used an accepted tool with valid arguments on the first attempt.

export const RENDER = 'ui_render'
export const WIDGET = 'ui_render_widget'
export const PATCH = 'ui_patch'
export const COMPOSE = 'ui_compose'

/** UIs whose current version changed during `turn` (rendered or patched). */
export function touched(convo, turn) {
  const ids = new Set(turn.calls.filter(c => c.ok && (c.name === RENDER || c.name === PATCH)).map(c => (c.name === RENDER ? c.id : c.args.uiId)))
  return [...convo.uis().values()].filter(ui => ids.has(ui.uiId))
}

export const lastWidget = turn => turn.calls.filter(c => c.ok && c.name === WIDGET).at(-1)?.args

/** Score one turn: tool choice, first-attempt schema validity, then the case's own checks. */
export function scoreTurn(turn, expect, checks) {
  const uiCalls = turn.calls.filter(c => c.name.startsWith('ui_'))
  const accepted = [].concat(expect)
  const okTools = uiCalls.filter(c => c.ok).map(c => c.name)
  const toolOk = accepted.includes('none') ? uiCalls.length === 0 : okTools.some(n => accepted.includes(n))
  const first = uiCalls[0]
  return [
    [`tool: ${accepted.join(' or ')}`, toolOk, uiCalls.map(c => `${c.name}${c.ok ? '' : ' (refused)'}`).join(' → ') || 'no tool'],
    ...(first ? [['arguments valid on the first attempt', first.ok, first.ok ? '' : first.errors.slice(0, 3).join('; ')]] : []),
    ...(turn.exhausted ? [['turn finished within the step limit', false, 'model kept calling tools']] : []),
    ...checks,
  ]
}
