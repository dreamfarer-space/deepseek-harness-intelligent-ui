import { useLayoutEffect } from 'react'
import { RenderView } from './catalog/RenderView.tsx'
import { Shell } from './shell.tsx'
import { presented, selectTurnResults, usePresentedBelow, type TurnTailOwner } from './turn.ts'
import type { IntelligentUiInjected, ToolViewProps, Translate } from './types/dsh.ts'
import { WidgetView } from './widget/WidgetView.tsx'
import { WIDGET_TOOL } from '../src/tools/widget.js'

type TailProps = TurnTailOwner & IntelligentUiInjected & { t: Translate }

/** `conversation.chat.turnTail` entry: the Turn's generated UIs beneath its reply. */
export function TurnTail(props: TailProps) {
  const results = selectTurnResults(props)
  if (results.length === 0) return null
  return (
    <div className="diui-tail">
      {results.map(block => <TailItem key={block.callId} block={block} t={props.t} sendPrompt={props.sendPrompt} />)}
    </div>
  )
}

function TailItem(props: { block: Extract<ToolViewProps, { phase: 'result' }>['block']; t: Translate; sendPrompt: IntelligentUiInjected['sendPrompt'] }) {
  const { block } = props
  // Claim the call before paint so the inline copy collapses in the same frame.
  useLayoutEffect(() => presented.add(block.callId), [block.callId])
  const toolName = block.call?.name ?? ''
  const View = toolName === WIDGET_TOOL ? WidgetView : RenderView
  return <View phase="result" block={block} callId={block.callId} toolName={toolName} t={props.t} sendPrompt={props.sendPrompt} />
}

/**
 * Wrap a tool view: while the Turn runs it renders inline (streaming);
 * once the Turn tail shows the call, the inline copy becomes a pointer.
 */
export function inlineView(View: (p: ToolViewProps) => JSX.Element) {
  return function InlineToolView(props: ToolViewProps) {
    const below = usePresentedBelow(props.callId)
    if (below && props.phase === 'result') {
      return <Shell kind={props.toolName === WIDGET_TOOL ? 'widget' : 'render'} title={props.t('turn.shownBelow')} state="ready" />
    }
    return <View {...props} />
  }
}
