import { useMemo, useState } from 'react'
import { BridgeGuard } from '../bridge.ts'
import { DEFAULT_POLICY, policyFromMeta } from '../policy.ts'
import { HeadButton, Placeholder, Problem, Shell, useThrottled } from '../shell.tsx'
import { usePartialArguments } from '../stream/args.ts'
import { useStashOnDrop } from '../interrupted.ts'
import { argsRawOf, interrupted, refused, resultText, type ToolViewProps } from '../types/dsh.ts'
import { readComposeBlocks, readComposeTitle, type ComposeBlock } from './blocks.ts'
import { useLatestUiVersion } from '../versions.ts'
import { Markdown } from './Markdown.tsx'
import { indexNodes } from '../catalog/RenderView.tsx'
import { renderNode, type RenderEnv, type UiNode } from '../catalog/components.tsx'
import { WidgetWithErrors } from '../widget/WidgetWithErrors.tsx'

/**
 * Stable identity of a catalog block: derived from the composition call id and
 * the block id, exactly like the Host derives it for `ui_patch`.
 */
export function blockUiId(callId: string, blockId: string): string {
  return `${callId}#${blockId}`
}

/** Copy the answer's prose in order; UI blocks become a one-line pointer. */
export function copyText(blocks: ComposeBlock[]): string {
  return blocks.map(block => {
    if (block.type === 'markdown') return block.text ?? ''
    return block.type === 'catalog' ? `[UI: ${block.title ?? block.id}]` : `[Widget: ${block.title ?? block.id}]`
  }).join('\n\n')
}

/** A widget block: the existing sandboxed frame, keyed by its own identity. */
function WidgetBlock(props: { block: ComposeBlock; env: RenderEnv; settled: boolean; policy: ReturnType<typeof policyFromMeta>; title: string }) {
  const { block, env } = props
  const html = typeof block.html === 'string' ? block.html : ''
  const complete = props.settled && html !== ''
  if (html === '' && typeof block.css !== 'string') {
    return <Placeholder messages={block.placeholderMessages ?? []} fallback={env.t('widget.generating')} height={block.initialHeight} />
  }
  return (
    <div className="diui-compose-widget">
      <div className="diui-compose-widget-head">{props.title}</div>
      <WidgetWithErrors
        t={env.t}
        controlled={env.controlled}
        sessionId={env.sessionId}
        callId={blockUiId(env.callId ?? '', block.id)}
        mode={complete ? 'final' : 'preview'}
        css={typeof block.css === 'string' ? block.css : ''}
        html={html}
        jsFunctions={complete && typeof block.jsFunctions === 'string' ? block.jsFunctions : undefined}
        jsExpressions={complete && Array.isArray(block.jsExpressions) ? block.jsExpressions.filter((s): s is string => typeof s === 'string') : undefined}
        initialHeight={typeof block.initialHeight === 'number' ? block.initialHeight : undefined}
        policy={props.policy}
        title={props.title}
        sendPrompt={env.send}
      />
    </div>
  )
}

/** One catalog block: the existing component renderer, unchanged. */
function CatalogBlock(props: { block: ComposeBlock; env: RenderEnv; nodes: ReadonlyMap<string, UiNode>; sendNewSessionPrompt?: ToolViewProps['sendNewSessionPrompt'] }) {
  const { block, env } = props
  const callId = blockUiId(env.callId ?? '', block.id)
  const blockEnv: RenderEnv = {
    ...env, nodes: props.nodes, callId,
    sendNewSession: props.sendNewSessionPrompt
      ? (text, nodeId) => props.sendNewSessionPrompt!(text, callId, nodeId)
      : undefined,
  }
  if (typeof block.root !== 'string' || block.root === '') {
    return <div className="diui-node-error">{env.t('node.missing', { id: String(block.root ?? '') })}</div>
  }
  return <div className="diui-render">{renderNode(block.root, blockEnv)}</div>
}

/**
 * `ui_compose` tool card: the composed answer itself — prose and UI in the
 * model's order, rendered block by block while it streams. Only the shell
 * header names the answer; the prose is not wrapped in a card.
 */
export function ComposeView(props: ToolViewProps) {
  const partial = usePartialArguments(props, 100)
  useStashOnDrop(props, partial)
  const streamed = useThrottled(props.phase === 'preparing' ? partial : '', 100)
  const settledRaw = argsRawOf(props)
  const streaming = props.phase === 'preparing'
  const block = props.phase === 'result' ? props.block : undefined
  const stopped = !!block && (interrupted(block) || block.isError)
  // A stopped generation keeps the finished blocks: salvage them from the argument prefix.
  const salvage = streaming || stopped
  const raw = streaming ? streamed : settledRaw
  const blocks = useMemo(() => readComposeBlocks(raw, salvage), [raw, salvage])
  const title = useMemo(() => readComposeTitle(raw, salvage), [raw, salvage])
  const meta = block?.meta
  const policy = useMemo(() => meta === undefined ? DEFAULT_POLICY : policyFromMeta(meta), [meta])
  const guard = useMemo(() => new BridgeGuard({ policy, armDelayMs: 0, minIntervalMs: 1000 }), [policy])
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const { t } = props
  const heading = title || t('compose.title')

  if (block && refused(block)) {
    return (
      <Shell kind="render" title={heading} state="error">
        <Problem t={t} message={t('compose.invalid')} detail={resultText(block)} />
      </Shell>
    )
  }
  if (props.phase !== 'preparing' && !stopped && blocks.length === 0) {
    return <Shell kind="render" title={heading} state="error"><Problem t={t} message={t('compose.malformed')} /></Shell>
  }
  const settled = props.phase === 'result' && !stopped
  const env: RenderEnv = {
    controlled: props.controlled, sessionId: props.sessionId,
    nodes: new Map(),
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
    try { await props.sendPrompt(t('prompt.regenerateCompose', { title: heading })) } catch { /* the composer shows failures */ } finally { setSending(false) }
  }
  const copy = () => {
    void navigator.clipboard?.writeText(copyText(blocks)).then(() => setCopied(true), () => setCopied(false))
  }
  const actions = stopped
    ? <HeadButton label={t('action.regenerate')} disabled={sending} onClick={() => { void regenerate() }} />
    : settled && blocks.some(b => b.type === 'markdown')
      ? <HeadButton label={copied ? t('compose.copied') : t('compose.copy')} onClick={copy} />
      : undefined
  return (
    <Shell
      kind="render"
      title={heading}
      state={stopped ? 'stopped' : props.phase === 'result' ? 'ready' : 'generating'}
      status={stopped ? undefined : t('compose.blocks', { count: blocks.length })}
      notice={stopped ? (interrupted(block!) ? t('compose.stopped') : t('compose.failed')) : undefined}
      actions={actions}
      plain={settled}
    >
      {blocks.length === 0
        ? <Placeholder messages={[]} fallback={t('compose.generating')} />
        : (
            <div className="diui-compose">
              {blocks.map((entry, index) => (
                <BlockItem key={`${entry.id}:${index}`} block={entry} env={env} settled={settled} policy={policy}
                  sendNewSessionPrompt={settled && props.sendNewSessionPrompt
                    ? async (text, uiId, nodeId) => { await props.sendNewSessionPrompt!(guard.admitPrompt(text), uiId, nodeId) }
                    : undefined} />
              ))}
            </div>
          )}
    </Shell>
  )
}

function BlockItem(props: { block: ComposeBlock; env: RenderEnv; settled: boolean; policy: ReturnType<typeof policyFromMeta>; sendNewSessionPrompt?: ToolViewProps['sendNewSessionPrompt'] }) {
  const { block, env } = props
  // Hooks run for every block; only catalog blocks use their nodes/version.
  const nodes = useMemo(() => block.type === 'catalog' ? indexNodes(block.components) : new Map<string, UiNode>(), [block])
  const latest = useLatestUiVersion(block.type === 'catalog' ? blockUiId(env.callId ?? '', block.id) : undefined)
  if (block.type === 'markdown') return <Markdown text={block.text ?? ''} />
  if (block.type === 'widget') {
    return <WidgetBlock block={block} env={env} settled={props.settled} policy={props.policy} title={block.title || env.t('widget.title')} />
  }
  if (latest && latest.version > 1) {
    return (
      <div className="diui-compose-pointer" role="status">
        {(block.title ? `${block.title} · ` : '') + env.t('patch.superseded', { version: latest.version })}
      </div>
    )
  }
  return <CatalogBlock block={block} env={env} nodes={nodes} sendNewSessionPrompt={props.sendNewSessionPrompt} />
}
