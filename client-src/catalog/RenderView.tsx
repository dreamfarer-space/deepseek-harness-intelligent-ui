import { useMemo, useState } from 'react'
import { BridgeGuard } from '../bridge.ts'
import { DEFAULT_POLICY, policyFromMeta } from '../policy.ts'
import { HeadButton, Placeholder, Problem, Shell, useThrottled } from '../shell.tsx'
import { parseArgs, scanPartialObject } from '../stream/partial-json.ts'
import { useStashOnDrop } from '../interrupted.ts'
import { argsRawOf, interrupted, refused, resultText, type ToolViewProps } from '../types/dsh.ts'
import { renderNode, type RenderEnv, type UiNode } from './components.tsx'

function isNode(v: unknown): v is UiNode {
  return !!v && typeof v === 'object' && typeof (v as UiNode).id === 'string' && typeof (v as UiNode).type === 'string'
}

function indexNodes(list: unknown): Map<string, UiNode> {
  const map = new Map<string, UiNode>()
  if (Array.isArray(list)) for (const n of list) if (isNode(n) && !map.has(n.id)) map.set(n.id, n)
  return map
}

interface Tree { title?: string; root?: string; nodes: Map<string, UiNode>; complete: boolean }

/** Parse complete arguments, or salvage the finished components of a prefix. */
function readTree(raw: string, partial: boolean): Tree | undefined {
  if (!partial) {
    const args = parseArgs(raw)
    if (args) {
      return {
        title: typeof args.title === 'string' ? args.title : undefined,
        root: typeof args.root === 'string' ? args.root : undefined,
        nodes: indexNodes(args.components),
        complete: true,
      }
    }
  }
  const f = scanPartialObject(raw)
  if (Object.keys(f).length === 0) return undefined
  const nodes = indexNodes(f.components?.value)
  // The root id may stream after the components; fall back to the first node.
  const root = f.root?.complete && typeof f.root.value === 'string' ? f.root.value : nodes.keys().next().value
  return { title: typeof f.title?.value === 'string' ? f.title.value : undefined, root, nodes, complete: false }
}

/**
 * `ui_render` tool card: progressive native rendering of the component tree.
 * One component across all phases so interaction state and layout carry over
 * from the streaming preview to the settled UI without a remount.
 */
export function RenderView(props: ToolViewProps) {
  // Bound for every phase; returns '' once the call is dispatched.
  const partial = props.useToolCallArgumentsPartial?.() ?? ''
  useStashOnDrop(props, partial)
  const streamed = useThrottled(props.phase === 'preparing' ? partial : '', 100)
  const settledRaw = argsRawOf(props)
  const tree = useMemo(() => props.phase === 'preparing' ? readTree(streamed, true) : readTree(settledRaw, false),
    [props.phase, streamed, settledRaw])
  const meta = props.phase === 'result' ? props.block.meta : undefined
  const policy = useMemo(() => meta === undefined ? DEFAULT_POLICY : policyFromMeta(meta), [meta])
  const guard = useMemo(() => new BridgeGuard({ policy, armDelayMs: 0, minIntervalMs: 1000 }), [policy])
  const [sending, setSending] = useState(false)
  const { t } = props
  const title = tree?.title || t('render.title')

  const block = props.phase === 'result' ? props.block : undefined
  if (block && refused(block)) {
    return (
      <Shell kind="render" title={title} state="error">
        <Problem t={t} message={t('render.invalid')} detail={resultText(block)} />
      </Shell>
    )
  }
  const stopped = !!block && (interrupted(block) || block.isError)
  if (props.phase !== 'preparing' && !stopped && (!tree?.complete || tree.root === undefined)) {
    return <Shell kind="render" title={title} state="error"><Problem t={t} message={t('render.malformed')} /></Shell>
  }

  const settled = props.phase !== 'preparing' && !stopped
  const env: RenderEnv = {
    nodes: tree?.nodes ?? new Map(),
    streaming: !settled,
    stopped,
    t,
    callId: props.callId,
    policy,
    send: settled
      ? async (text) => { await props.sendPrompt(guard.admitPrompt(text)) }
      : () => Promise.reject(new Error(t('render.notReady'))),
  }
  const regenerate = async () => {
    setSending(true)
    try { await props.sendPrompt(t('prompt.regenerateUi', { title })) } catch { /* the composer shows failures */ } finally { setSending(false) }
  }
  return (
    <Shell
      kind="render"
      title={title}
      state={stopped ? 'stopped' : props.phase === 'result' ? 'ready' : 'generating'}
      notice={stopped ? (interrupted(block!) ? t('render.stopped') : t('render.failed')) : undefined}
      actions={stopped ? <HeadButton label={t('action.regenerate')} disabled={sending} onClick={() => { void regenerate() }} /> : undefined}
    >
      {tree?.root !== undefined
        ? <div className="diui-render">{renderNode(tree.root, env)}</div>
        : stopped
          ? <Problem t={t} message={t('render.nothingToShow')} detail={block ? resultText(block) : undefined} />
          : <Placeholder messages={[]} fallback={t('render.generating')} />}
    </Shell>
  )
}
