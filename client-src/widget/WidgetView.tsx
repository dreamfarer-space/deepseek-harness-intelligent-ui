import { useEffect, useMemo, useState } from 'react'
import { policyFromMeta, DEFAULT_POLICY } from '../policy.ts'
import { parseArgs, scanPartialObject } from '../stream/partial-json.ts'
import { Problem, Shell, useFlash, useThrottled } from '../shell.tsx'
import { argsRawOf, refused, resultText, type ToolViewProps } from '../types/dsh.ts'
import { WidgetFrame } from './WidgetFrame.tsx'

/** `ui_render_widget` tool card: placeholder → live preview → final sandboxed widget. */
export function WidgetView(props: ToolViewProps) {
  if (props.phase === 'preparing') return <PreparingWidget {...props} />
  return <SettledWidget {...props} />
}

function PreparingWidget(props: Extract<ToolViewProps, { phase: 'preparing' }>) {
  const raw = useThrottled(props.useToolCallArgumentsPartial?.() ?? '', 150)
  const fields = useMemo(() => scanPartialObject(raw), [raw])
  const title = str(fields.title?.value) || props.t('widget.title')
  const messages = (Array.isArray(fields.placeholderMessages?.value) ? fields.placeholderMessages!.value as unknown[] : [])
    .filter((m): m is string => typeof m === 'string')
  const cssDone = fields.css?.complete === true
  return (
    <Shell kind="widget" title={title} state="generating" status={cssDone ? props.t('widget.preview') : undefined}>
      {cssDone
        ? (
            <WidgetFrame
              callId={props.callId}
              mode="preview"
              css={str(fields.css?.value)}
              html={str(fields.html?.value)}
              initialHeight={num(fields.initialHeight?.value)}
              policy={DEFAULT_POLICY}
              title={title}
              sendPrompt={props.sendPrompt}
            />
          )
        : <Placeholder messages={messages} fallback={props.t('widget.generating')} />}
    </Shell>
  )
}

function SettledWidget(props: Exclude<ToolViewProps, { phase: 'preparing' }>) {
  const raw = argsRawOf(props)
  const args = useMemo(() => parseArgs(raw), [raw])
  // Derived once per argument text so the frame document stays referentially stable.
  const view = useMemo(() => args && {
    css: str(args.css),
    html: str(args.html),
    jsFunctions: str(args.jsFunctions),
    jsExpressions: strings(args.jsExpressions),
    initialHeight: num(args.initialHeight),
  }, [args])
  const policy = useMemo(() => props.phase === 'result' ? policyFromMeta(props.block.meta) : DEFAULT_POLICY,
    [props.phase, props.phase === 'result' ? props.block.meta : undefined])
  const [flash, setFlash] = useFlash()
  const [errors, setErrors] = useState<readonly string[]>([])
  const title = str(args?.title) || props.t('widget.title')

  if (props.phase === 'result' && (props.block.isError || refused(props.block))) {
    const invalid = refused(props.block)
    return (
      <Shell kind="widget" title={title} state="error">
        <Problem t={props.t} message={invalid ? props.t('widget.invalid') : props.t('widget.failed')} detail={resultText(props.block)} />
      </Shell>
    )
  }
  if (!args || typeof args.html !== 'string') {
    return <Shell kind="widget" title={title} state="error"><Problem t={props.t} message={props.t('widget.malformed')} /></Shell>
  }
  const status = flash ?? (errors.length ? <span title={errors.join('\n')}>{props.t('widget.scriptErrors', { count: errors.length })}</span> : undefined)
  return (
    <Shell kind="widget" title={title} state={props.phase === 'start' ? 'generating' : 'ready'} status={status}>
      <WidgetFrame
        callId={props.callId}
        mode="final"
        css={view!.css}
        html={view!.html}
        jsFunctions={view!.jsFunctions}
        jsExpressions={view!.jsExpressions}
        initialHeight={view!.initialHeight}
        policy={policy}
        title={title}
        sendPrompt={props.sendPrompt}
        onSent={(ok, reason) => setFlash(ok ? props.t('bridge.sent') : props.t('bridge.failed', { reason: reason ?? '' }))}
        onErrors={setErrors}
      />
    </Shell>
  )
}

function Placeholder(props: { messages: readonly string[]; fallback: string }) {
  const lines = props.messages.length ? props.messages : [props.fallback]
  const [i, setI] = useState(0)
  useEffect(() => {
    if (lines.length < 2) return
    const timer = setInterval(() => setI(n => n + 1), 1800)
    return () => clearInterval(timer)
  }, [lines.length])
  return (
    <div className="diui-placeholder" aria-live="polite">
      <div className="diui-skeleton" />
      <div className="diui-placeholder-text">{lines[i % lines.length]}</div>
    </div>
  )
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
