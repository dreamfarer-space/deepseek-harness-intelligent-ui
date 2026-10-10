import { useMemo, useState } from 'react'
import { DEFAULT_POLICY, policyFromMeta } from '../policy.ts'
import { HeadButton, Placeholder, Problem, Shell, useFlash, useThrottled } from '../shell.tsx'
import { parseArgs, scanPartialObject } from '../stream/partial-json.ts'
import { useStashOnDrop } from '../interrupted.ts'
import { argsRawOf, interrupted, refused, resultText, type ToolViewProps } from '../types/dsh.ts'
import { WidgetFrame } from './WidgetFrame.tsx'
import { usePartialArguments } from '../stream/args.ts'

interface WidgetArgs {
  title: string
  css: string
  html: string
  jsFunctions: string
  jsExpressions: string[]
  initialHeight?: number
  placeholderMessages: string[]
  /** css finished streaming (a preview frame can open). */
  cssDone: boolean
}

/**
 * `ui_render_widget` tool card: placeholder → live preview → final widget.
 * One component across all phases, so the same iframe is streamed into and
 * then finalized in place (no rebuild, no flash). A stopped or failed
 * generation keeps whatever preview was already visible.
 */
export function WidgetView(props: ToolViewProps) {
  // Bound for every phase; returns '' once the call is dispatched (any supported DSH version).
  const partial = usePartialArguments(props, 120)
  useStashOnDrop(props, partial)
  const streamed = useThrottled(props.phase === 'preparing' ? partial : '', 120)
  const settledRaw = argsRawOf(props)
  const { args, full } = useMemo<{ args?: WidgetArgs; full: boolean }>(() => {
    if (props.phase === 'preparing') return { args: fromPartial(streamed), full: false }
    const parsed = parseArgs(settledRaw)
    if (parsed && typeof parsed.html === 'string' && parsed.html !== '') return { args: fromFull(parsed), full: true }
    // Cut-off arguments (stopped generation): salvage the prefix.
    return { args: settledRaw ? fromPartial(settledRaw) : undefined, full: false }
  }, [props.phase, streamed, settledRaw])
  const policy = useMemo(() => props.phase === 'result' ? policyFromMeta(props.block.meta) : DEFAULT_POLICY,
    [props.phase, props.phase === 'result' ? props.block.meta : undefined])
  const [flash, setFlash] = useFlash()
  const [sending, setSending] = useState(false)
  const [errors, setErrors] = useState<readonly string[]>([])
  const [generation, setGeneration] = useState(0)
  const { t } = props
  const title = args?.title || t('widget.title')

  const block = props.phase === 'result' ? props.block : undefined
  const stopped = !!block && (interrupted(block) || (block.isError && !refused(block)))
  if (block && refused(block)) {
    return (
      <Shell kind="widget" title={title} state="error">
        <Problem t={t} message={t('widget.invalid')} detail={resultText(block)} />
      </Shell>
    )
  }

  // A complete argument object runs as the final widget, even if the turn was stopped afterwards.
  const complete = full && !!args
  if (props.phase !== 'preparing' && !stopped && !complete) {
    return <Shell kind="widget" title={title} state="error"><Problem t={t} message={t('widget.malformed')} /></Shell>
  }

  const send = async (text: string) => {
    setSending(true)
    try {
      await props.sendPrompt(text)
      setFlash(t('bridge.sent'))
    } catch (err) {
      setFlash(t('bridge.failed', { reason: err instanceof Error ? err.message : String(err) }))
    } finally {
      setSending(false)
    }
  }

  let status: React.ReactNode
  let actions: React.ReactNode
  let notice: React.ReactNode
  if (stopped) {
    notice = interrupted(block!) ? t('widget.stopped') : t('widget.failed')
    actions = <HeadButton label={t('action.regenerate')} disabled={sending} onClick={() => { void send(t('prompt.regenerateWidget', { title })) }} />
  } else if (sending) {
    status = t('bridge.sending')
  } else if (flash) {
    status = flash
  } else if (errors.length) {
    status = <span className="diui-error-count" title={errors.join('\n')}>{t('widget.scriptErrors', { count: errors.length })}</span>
    actions = (
      <>
        <HeadButton label={t('action.reload')} onClick={() => { setErrors([]); setGeneration(g => g + 1) }} />
        <HeadButton
          label={t('action.fix')}
          disabled={sending}
          onClick={() => { void send(t('prompt.fixWidget', { title, errors: errors.slice(0, 8).map(e => `- ${e}`).join('\n') })) }}
        />
      </>
    )
  } else if (props.phase === 'preparing' && args?.cssDone) {
    status = t('widget.preview')
  }

  const showFrame = !!args && args.cssDone
  const mode = complete ? 'final' : 'preview'
  return (
    <Shell kind="widget" title={title} state={stopped ? 'stopped' : complete && props.phase === 'result' ? 'ready' : 'generating'} status={status} actions={actions} notice={notice}>
      {showFrame
        ? (
            <WidgetFrame
              callId={props.callId}
              mode={mode}
              css={args.css}
              html={args.html}
              jsFunctions={complete ? args.jsFunctions : undefined}
              jsExpressions={complete ? args.jsExpressions : undefined}
              initialHeight={args.initialHeight}
              policy={policy}
              title={title}
              generation={generation}
              sendPrompt={props.sendPrompt}
              onSending={setSending}
              onSent={(ok, reason) => setFlash(ok ? t('bridge.sent') : t('bridge.failed', { reason: reason ?? '' }))}
              onErrors={setErrors}
            />
          )
        : stopped
          ? <Problem t={t} message={t('widget.nothingToShow')} detail={block ? resultText(block) : undefined} />
          : <Placeholder messages={args?.placeholderMessages ?? []} fallback={t('widget.generating')} height={args?.initialHeight} />}
    </Shell>
  )
}

function fromPartial(raw: string): WidgetArgs | undefined {
  const f = scanPartialObject(raw)
  if (Object.keys(f).length === 0) return undefined
  return {
    title: str(f.title?.value),
    css: str(f.css?.value),
    html: str(f.html?.value),
    jsFunctions: '',
    jsExpressions: [],
    initialHeight: num(f.initialHeight?.value),
    placeholderMessages: strings(f.placeholderMessages?.value),
    cssDone: f.css?.complete === true || (f.css === undefined && f.html !== undefined),
  }
}

function fromFull(a: Record<string, unknown>): WidgetArgs {
  return {
    title: str(a.title),
    css: str(a.css),
    html: str(a.html),
    jsFunctions: str(a.jsFunctions),
    jsExpressions: strings(a.jsExpressions),
    initialHeight: num(a.initialHeight),
    placeholderMessages: strings(a.placeholderMessages),
    cssDone: true,
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
