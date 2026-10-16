import { useMemo, useState } from 'react'
import { BridgeGuard } from '../bridge.ts'
import { useStashOnDrop } from '../interrupted.ts'
import { DEFAULT_POLICY, policyFromMeta } from '../policy.ts'
import { HeadButton, Problem, Shell } from '../shell.tsx'
import { usePartialArguments } from '../stream/args.ts'
import { parseArgs, scanPartialObject } from '../stream/partial-json.ts'
import { patchedUiOf } from '../turn.ts'
import { argsRawOf, interrupted, refused, resultText, type ToolViewProps } from '../types/dsh.ts'
import { useLatestUiVersion } from '../versions.ts'
import { renderNode, type RenderEnv } from './components.tsx'
import { indexNodes } from './RenderView.tsx'

/** The uiId the call targets, from complete or partial arguments. */
function targetOf(raw: string, partial: boolean): string | undefined {
  if (!partial) {
    const args = parseArgs(raw)
    if (args) return typeof args.uiId === 'string' ? args.uiId : undefined
  }
  const f = scanPartialObject(raw)
  return f.uiId?.complete && typeof f.uiId.value === 'string' ? f.uiId.value : undefined
}

/**
 * `ui_patch` tool card. While the patch streams or runs, it is a one-line
 * status: the previous version stays live and nothing half-applied is ever
 * drawn. A successful result renders the complete next version (from the
 * result meta) under the UI's own id, so every component the patch did not
 * replace keeps its interaction state. A refused, failed or stopped patch
 * leaves the previous version untouched.
 */
export function PatchView(props: ToolViewProps) {
  const partial = usePartialArguments(props, 100)
  useStashOnDrop(props, partial)
  const block = props.phase === 'result' ? props.block : undefined
  const ui = block && !block.isError ? patchedUiOf(block.meta) : undefined
  const target = ui?.uiId ?? targetOf(props.phase === 'preparing' ? partial : argsRawOf(props), props.phase === 'preparing')
  const latest = useLatestUiVersion(target)
  const meta = block?.meta
  const policy = useMemo(() => meta === undefined ? DEFAULT_POLICY : policyFromMeta(meta), [meta])
  const guard = useMemo(() => new BridgeGuard({ policy, armDelayMs: 0, minIntervalMs: 1000 }), [policy])
  const nodes = useMemo(() => indexNodes(ui?.components), [ui])
  const [sending, setSending] = useState(false)
  const { t } = props
  const title = ui?.title || latest?.title || t('render.title')

  if (!block) return <Shell kind="render" title={title} state="generating" status={t('patch.updating')} />
  if (refused(block)) {
    return (
      <Shell kind="render" title={title} state="error">
        <Problem t={t} message={t('patch.invalid')} detail={resultText(block)} />
      </Shell>
    )
  }
  if (!ui) {
    const retry = async () => {
      setSending(true)
      try { await props.sendPrompt(t('prompt.regeneratePatch', { title })) } catch { /* the composer shows failures */ } finally { setSending(false) }
    }
    return (
      <Shell
        kind="render"
        title={title}
        state="stopped"
        notice={interrupted(block) ? t('patch.stopped') : t('patch.failed')}
        actions={<HeadButton label={t('action.regenerate')} disabled={sending} onClick={() => { void retry() }} />}
      />
    )
  }
  if (latest && latest.version > ui.version) {
    return <Shell kind="render" title={title} state="ready" status={t('patch.superseded', { version: latest.version })} />
  }
  const env: RenderEnv = {
    controlled: props.controlled, sessionId: props.sessionId,
    nodes,
    streaming: false,
    t,
    // The UI's identity, not this call's: state persists across versions.
    callId: ui.uiId,
    policy,
    send: async (text) => { await props.sendPrompt(guard.admitPrompt(text)) },
  }
  return (
    <Shell kind="render" title={title} state="ready" status={t('patch.version', { version: ui.version })}>
      <div className="diui-render">{renderNode(ui.root, env)}</div>
    </Shell>
  )
}
