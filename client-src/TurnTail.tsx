import { useLayoutEffect, useMemo, type ReactElement } from 'react'
import { PatchView } from './catalog/PatchView.tsx'
import { RenderView } from './catalog/RenderView.tsx'
import { inTurn, useInterrupted } from './interrupted.ts'
import { Shell } from './shell.tsx'
import { presented, selectTurnResults, usePresentedBelow, type TurnTailOwner } from './turn.ts'
import type { IntelligentUiInjected, ToolResultNode, ToolViewProps, Translate } from './types/dsh.ts'
import { WidgetView } from './widget/WidgetView.tsx'
import { WIDGET_TOOL } from '../src/tools/widget.js'
import { PATCH_TOOL } from '../src/tools/patch.js'
import { COMPOSE_TOOL } from '../src/compose/constants.js'
import { ComposeView } from './compose/ComposeView.tsx'

type TailProps = TurnTailOwner & IntelligentUiInjected & { t: Translate }

/** `conversation.chat.turnTail` entry: the Turn's generated UIs beneath its reply. */
export function TurnTail(props: TailProps) {
  const results = selectTurnResults(props)
  const stashed = useInterrupted(props.sessionId)
  const start = props.turn.start?.time
  const end = props.turn.end?.time
  // UI calls the user stopped mid-stream: DSH dropped them, so they only exist in the stash.
  const dropped = useMemo<ToolResultNode[]>(() => stashed
    .filter(s => inTurn(s, start, end) && !results.some(r => r.callId === s.callId))
    .map(s => ({
      kind: 'tool-result',
      callId: s.callId,
      call: { name: s.toolName, argsRaw: s.argsRaw },
      content: [],
      isError: true,
      error: { name: 'Interrupted', code: 'interrupted' },
    })), [stashed, start, end, results])
  if (results.length === 0 && dropped.length === 0) return null
  return (
    <div className="diui-tail">
      {results.map(block => <TailItem key={block.callId} block={block} t={props.t} sendPrompt={props.sendPrompt} sendNewSessionPrompt={props.sendNewSessionPrompt} sessionId={props.sessionId} controlled={props.controlled} />)}
      {dropped.map(block => <TailItem key={block.callId} block={block} t={props.t} sendPrompt={props.sendPrompt} sendNewSessionPrompt={props.sendNewSessionPrompt} sessionId={props.sessionId} controlled={props.controlled} />)}
    </div>
  )
}

function TailItem(props: { block: ToolResultNode; t: Translate } & IntelligentUiInjected) {
  const { block } = props
  // Claim the call before paint so the inline copy collapses in the same frame.
  useLayoutEffect(() => presented.add(block.callId), [block.callId])
  const toolName = block.call?.name ?? ''
  const View = toolName === WIDGET_TOOL ? WidgetView
    : toolName === PATCH_TOOL ? PatchView
    : toolName === COMPOSE_TOOL ? ComposeView
    : RenderView
  return <View phase="result" block={block} callId={block.callId} toolName={toolName} t={props.t} sendPrompt={props.sendPrompt} sendNewSessionPrompt={props.sendNewSessionPrompt} sessionId={props.sessionId} controlled={props.controlled} />
}

/**
 * Wrap a tool view: while the Turn runs it renders inline (streaming);
 * once the Turn tail shows the call, the inline copy becomes a pointer.
 */
export function inlineView(View: (p: ToolViewProps) => ReactElement) {
  return function InlineToolView(props: ToolViewProps) {
    const below = usePresentedBelow(props.callId)
    if (below && props.phase === 'result') {
      return <Shell kind={props.toolName === WIDGET_TOOL ? 'widget' : 'render'} title={props.t('turn.shownBelow')} state="ready" />
    }
    return <View {...props} />
  }
}
