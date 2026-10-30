import { useState } from 'react'
import { embedSource, PROVIDER_NAMES } from '../../src/catalog/video.js'
import type { WidgetPolicy } from '../policy.ts'
import type { Translate } from '../types/dsh.ts'
import { checkMedia, httpsUrl } from './media.ts'

export interface VideoProps {
  src: string
  title?: string
  poster?: string
  caption?: string
  credit?: string
  creditUrl?: string
  start?: number
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16'
}
interface Env { policy: WidgetPolicy; t: Translate }

const reasonKey = { invalid: 'video.invalid', blocked: 'video.blocked', offline: 'video.offline' } as const

/**
 * A video from a platform page link (official embed player, loaded only after
 * the user presses play) or a direct https file (native controls, metadata
 * only until played). Always offers a link to the original.
 */
export function Video(props: VideoProps & Env) {
  const { t, policy } = props
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const embed = embedSource(props.src, props.start)
  const ratio = (props.aspectRatio ?? '16:9').replace(':', ' / ')
  const label = props.title ?? t('video.untitled')
  const check = checkMedia(embed ? embed.player(false) : props.src, policy)
  const poster = props.poster ? checkMedia(props.poster, policy) : undefined
  const original = embed ? embed.page : httpsUrl(props.src)?.href
  const openLabel = embed ? t('video.openOn', { site: PROVIDER_NAMES[embed.provider] }) : t('video.original')

  let stage
  if (!check.ok || failed === props.src) {
    stage = (
      <div className="diui-video-fallback" role="img" aria-label={label}>
        <span className="diui-photo-fallback-alt">{label}</span>
        <span className="diui-photo-fallback-why">{t(check.ok ? 'video.failed' : reasonKey[check.reason])}</span>
      </div>
    )
  } else if (embed && !playing) {
    stage = (
      <button type="button" className="diui-video-facade" data-provider={embed.provider} aria-label={t('video.play', { title: label })} onClick={() => setPlaying(true)}>
        {poster?.ok && <img src={poster.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />}
        <span className="diui-video-play" aria-hidden="true">▶</span>
        <span className="diui-video-note">{t('video.embedNote', { site: PROVIDER_NAMES[embed.provider] })}</span>
      </button>
    )
  } else if (embed) {
    stage = (
      <iframe className="diui-video-frame" src={embed.player(true)} title={label}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
        // YouTube's player refuses to start without the embedding origin as referrer.
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" />
    )
  } else {
    const src = props.start ? `${check.url}#t=${Math.floor(props.start)}` : check.url
    stage = (
      <video className="diui-video-player" src={src} poster={poster?.ok ? poster.url : undefined} controls preload="metadata" playsInline
        aria-label={label} onError={() => setFailed(props.src)} />
    )
  }

  const credit = httpsUrl(props.creditUrl)
  return (
    <figure className="diui-video">
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      <div className="diui-video-stage" style={{ aspectRatio: ratio }}>{stage}</div>
      <div className="diui-photo-caption">
        {props.caption && <span>{props.caption}</span>}
        {props.credit && <span className="diui-photo-credit">{credit ? <a href={credit.href} target="_blank" rel="noopener noreferrer">{props.credit}</a> : props.credit}</span>}
        {original && <a className="diui-video-open" href={original} target="_blank" rel="noopener noreferrer">{openLabel}</a>}
      </div>
    </figure>
  )
}
