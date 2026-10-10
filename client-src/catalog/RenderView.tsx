import { useMemo } from 'react'
import { BridgeGuard } from '../bridge.ts'
import { DEFAULT_POLICY, policyFromMeta } from '../policy.ts'
import { Problem, Shell, useThrottled } from '../shell.tsx'
import { parseArgs, scanPartialObject } from '../stream/partial-json.ts'
import { argsRawOf, refused, resultText, type ToolViewProps } from '../types/dsh.ts'
import { renderNode, type RenderEnv, type UiNode } from './components.tsx'

/** `ui_render` tool card: progressive native rendering of the component tree. */
export function RenderView(props: ToolViewProps) {
  if (props.phase === 'preparing') return <PreparingRender {...props} />
  return <SettledRender {...props} />
}

function isNode(v: unknown): v is UiNode {
  return !!v && typeof v === 'object' && typeof (v as UiNode).id === 'string' && typeof (v as UiNode).type === 'string'
}

function indexNodes(list: unknown): Map<string, UiNode> {
  const map = new Map<string, UiNode>()
  if (Array.isArray(list)) for (const n of list) if (isNode(n) && !map.has(n.id)) map.set(n.id, n)
  return map
}

function PreparingRender(props: Extract<ToolViewProps, { phase: 'preparing' }>) {
  const raw = useThrottled(props.useToolCallArgumentsPartial?.() ?? '', 120)
  const fields = useMemo(() => scanPartialObject(raw), [raw])
  const nodes = useMemo(() => indexNodes(fields.components?.value), [fields])
  const title = typeof fields.title?.value === 'string' ? fields.title.value : props.t('render.title')
  // The root id may stream after the components; fall back to the first node.
  const root = fields.root?.complete && typeof fields.root.value === 'string' ? fields.root.value : nodes.keys().next().value
  const env: RenderEnv = { nodes, streaming: true, t: props.t, send: () => Promise.reject(new Error('still generating')) }
  return (
    <Shell kind="render" title={title || props.t('render.title')} state="generating">
      {root !== undefined
        ? <div className="diui-render">{renderNode(root, env)}</div>
        : <div className="diui-placeholder"><div className="diui-skeleton" /><div className="diui-placeholder-text">{props.t('render.generating')}</div></div>}
    </Shell>
  )
}

function SettledRender(props: Exclude<ToolViewProps, { phase: 'preparing' }>) {
  const raw = argsRawOf(props)
  const args = useMemo(() => parseArgs(raw), [raw])
  const nodes = useMemo(() => indexNodes(args?.components), [args])
  const meta = props.phase === 'result' ? props.block.meta : undefined
  const guard = useMemo(() => new BridgeGuard({ policy: meta === undefined ? DEFAULT_POLICY : policyFromMeta(meta), armDelayMs: 0, minIntervalMs: 1000 }), [meta])
  const title = typeof args?.title === 'string' && args.title ? args.title : props.t('render.title')

  if (props.phase === 'result' && (props.block.isError || refused(props.block))) {
    return (
      <Shell kind="render" title={title} state="error">
        <Problem t={props.t} message={refused(props.block) ? props.t('render.invalid') : props.t('render.failed')} detail={resultText(props.block)} />
      </Shell>
    )
  }
  const root = typeof args?.root === 'string' ? args.root : undefined
  if (!args || root === undefined) {
    return <Shell kind="render" title={title} state="error"><Problem t={props.t} message={props.t('render.malformed')} /></Shell>
  }
  const env: RenderEnv = {
    nodes,
    streaming: false,
    t: props.t,
    send: async (text) => { await props.sendPrompt(guard.admitPrompt(text)) },
  }
  return (
    <Shell kind="render" title={title} state={props.phase === 'start' ? 'generating' : 'ready'}>
      <div className="diui-render">{renderNode(root, env)}</div>
    </Shell>
  )
}
