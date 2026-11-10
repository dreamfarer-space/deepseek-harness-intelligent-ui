import { useState } from 'react'
import type { WidgetPolicy } from '../policy.ts'
import type { Translate } from '../types/dsh.ts'
import { checkMedia, httpsUrl } from './media.ts'

export interface AudioProps {
  src: string
  title?: string
  caption?: string
  credit?: string
  creditUrl?: string
}
interface Env { policy: WidgetPolicy; t: Translate }

const reasonKey = { invalid: 'audio.invalid', blocked: 'audio.blocked', offline: 'audio.offline' } as const

/**
 * An audio file, loadable only over https and only under the call's media
 * policy. A blocked, offline or invalid source never mounts the player: the
 * component shows a labelled placeholder instead. The original is always linked.
 */
export function Audio(props: AudioProps & Env) {
  const { t, policy } = props
  const [failed, setFailed] = useState<string | null>(null)
  const label = props.title ?? t('audio.untitled')
  const check = checkMedia(props.src, policy)
  const original = httpsUrl(props.src)
  const credit = httpsUrl(props.creditUrl)

  const stage = !check.ok || failed === props.src ? (
    <div className="diui-audio-fallback" role="img" aria-label={label}>
      <span className="diui-photo-fallback-alt">{label}</span>
      <span className="diui-photo-fallback-why">{t(check.ok ? 'audio.failed' : reasonKey[check.reason])}</span>
    </div>
  ) : (
    <audio className="diui-audio-player" src={check.url} controls preload="metadata"
      aria-label={label} onError={() => setFailed(props.src)} />
  )

  return (
    <figure className="diui-audio">
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      {stage}
      <div className="diui-photo-caption">
        {props.caption && <span>{props.caption}</span>}
        {props.credit && <span className="diui-photo-credit">{credit ? <a href={credit.href} target="_blank" rel="noopener noreferrer">{props.credit}</a> : props.credit}</span>}
        {original && <a className="diui-video-open" href={original.href} target="_blank" rel="noopener noreferrer">{t('audio.original')}</a>}
      </div>
    </figure>
  )
}
