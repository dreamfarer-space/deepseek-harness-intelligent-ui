import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { WidgetPolicy } from '../policy.ts'
import type { Translate } from '../types/dsh.ts'
import { checkMedia, httpsUrl, type MediaBlock } from './media.ts'

export interface Photo { src: string; alt: string; caption?: string; credit?: string; creditUrl?: string }
interface Env { policy: WidgetPolicy; t: Translate }

const reasonKey = { invalid: 'photo.invalid', blocked: 'photo.blocked', offline: 'photo.offline' } as const

/** Placeholder that still tells the reader what the picture was. */
function Fallback({ photo, reason, env }: { photo: Photo; reason: MediaBlock | 'failed'; env: Env }) {
  const original = reason === 'failed' ? httpsUrl(photo.src) : undefined
  return (
    <div className="diui-photo-fallback" role="img" aria-label={photo.alt}>
      <span className="diui-photo-fallback-alt">{photo.alt}</span>
      <span className="diui-photo-fallback-why">{env.t(reason === 'failed' ? 'photo.failed' : reasonKey[reason])}</span>
      {original && <a href={original.href} target="_blank" rel="noopener noreferrer">{env.t('photo.original')}</a>}
    </div>
  )
}

/** An <img> that reports load failure and never sends a Referer. */
function Picture({ photo, env, className, style, onOpen }: { photo: Photo; env: Env; className: string; style?: CSSProperties; onOpen?: () => void }) {
  const check = checkMedia(photo.src, env.policy)
  const [state, setState] = useState<{ src: string; status: 'loading' | 'ready' | 'failed' }>({ src: photo.src, status: 'loading' })
  const status = state.src === photo.src ? state.status : 'loading'
  if (!check.ok) return <Fallback photo={photo} reason={check.reason} env={env} />
  if (status === 'failed') return <Fallback photo={photo} reason="failed" env={env} />
  const img = (
    <img className={className} src={check.url} alt={photo.alt} style={style} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
      data-status={status}
      onLoad={() => setState({ src: photo.src, status: 'ready' })}
      onError={() => setState({ src: photo.src, status: 'failed' })} />
  )
  if (!onOpen) return img
  return <button type="button" className="diui-photo-open" aria-label={env.t('photo.open', { alt: photo.alt })} onClick={onOpen}>{img}</button>
}

function Credit({ photo }: { photo: Photo }) {
  if (!photo.credit) return null
  const href = httpsUrl(photo.creditUrl)
  return <span className="diui-photo-credit">{href ? <a href={href.href} target="_blank" rel="noopener noreferrer">{photo.credit}</a> : photo.credit}</span>
}

function Caption({ photo }: { photo: Photo }) {
  if (!photo.caption && !photo.credit) return null
  return <figcaption className="diui-photo-caption">{photo.caption && <span>{photo.caption}</span>}<Credit photo={photo} /></figcaption>
}

/**
 * Full-size viewer in a modal <dialog>: the top layer escapes the card's
 * containment, Escape closes natively, arrow keys and buttons step through.
 */
function Lightbox({ photos, index, onIndex, onClose, env }: { photos: readonly Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void; env: Env }) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal() } else d.setAttribute('open', '')
    // showModal focuses the first control; start on Close so Enter/Escape never open a link.
    close.current?.focus()
    return () => { if (typeof d.close === 'function' && d.open) d.close() }
  }, [])
  const photo = photos[index]!
  const many = photos.length > 1
  const step = (delta: number) => onIndex((index + delta + photos.length) % photos.length)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && many) step(1)
    else if (e.key === 'ArrowLeft' && many) step(-1)
    else if (e.key === 'Escape') onClose()
    else return
    e.preventDefault()
  }
  const original = httpsUrl(photo.src)
  return (
    <dialog ref={ref} className="diui-lightbox" aria-label={env.t('photo.viewer')} onCancel={e => { e.preventDefault(); onClose() }} onKeyDown={onKey}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="diui-lightbox-body">
        <div className="diui-lightbox-bar">
          {many && <span className="diui-lightbox-count">{env.t('photo.count', { index: index + 1, count: photos.length })}</span>}
          {original && checkMedia(photo.src, env.policy).ok && <a href={original.href} target="_blank" rel="noopener noreferrer">{env.t('photo.original')}</a>}
          <button type="button" className="diui-lightbox-close" aria-label={env.t('photo.close')} ref={close} onClick={onClose}>✕</button>
        </div>
        <div className="diui-lightbox-stage">
          {many && <button type="button" className="diui-lightbox-step" data-dir="prev" aria-label={env.t('photo.prev')} onClick={() => step(-1)}>‹</button>}
          <Picture key={photo.src} photo={photo} env={env} className="diui-lightbox-img" />
          {many && <button type="button" className="diui-lightbox-step" data-dir="next" aria-label={env.t('photo.next')} onClick={() => step(1)}>›</button>}
        </div>
        <Caption photo={photo} />
      </div>
    </dialog>
  )
}

export function PhotoImage(props: Photo & { height?: number; fit?: 'cover' | 'contain' } & Env) {
  const [open, setOpen] = useState(false)
  const style = props.height ? { height: props.height, objectFit: props.fit ?? 'cover' } as const : { objectFit: props.fit ?? 'contain' } as const
  return (
    <figure className="diui-photo">
      <Picture photo={props} env={props} className="diui-photo-img" style={style} onOpen={() => setOpen(true)} />
      <Caption photo={props} />
      {open && <Lightbox photos={[props]} index={0} onIndex={() => {}} onClose={() => setOpen(false)} env={props} />}
    </figure>
  )
}

export function Gallery(props: { images: readonly Photo[]; title?: string; columns?: number } & Env) {
  const [open, setOpen] = useState<number | null>(null)
  const columns = Math.round(props.columns ?? Math.min(props.images.length, 3))
  return (
    <figure className="diui-gallery">
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      <ul className="diui-gallery-grid" style={{ ['--diui-cols' as string]: columns }}>
        {props.images.map((photo, i) => (
          <li key={i} className="diui-gallery-item">
            <Picture photo={photo} env={props} className="diui-gallery-img" onOpen={() => setOpen(i)} />
            {photo.caption && <span className="diui-gallery-caption">{photo.caption}</span>}
          </li>
        ))}
      </ul>
      {open !== null && open < props.images.length && <Lightbox photos={props.images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} env={props} />}
    </figure>
  )
}
