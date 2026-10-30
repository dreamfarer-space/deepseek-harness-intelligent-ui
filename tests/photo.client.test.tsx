// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { checkMedia } from '../client-src/catalog/media.ts'
import { en } from '../client-src/locales.ts'
import { DEFAULT_POLICY, policyFromMeta } from '../client-src/policy.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { validateProps } from '../src/catalog/catalog.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

function show(type: string, props: Record<string, unknown>, policy?: Record<string, unknown>) {
  const args = { root: 'n', components: [{ id: 'n', type, props }] }
  act(() => root.render(<RenderView callId="p1" toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
    block={{ kind: 'tool-result', callId: 'p1', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true, ...(policy ? { policy } : {}) } }} />))
}
const click = (el: Element) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const fire = (el: Element, type: string) => act(() => { el.dispatchEvent(new Event(type)) })
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })

const FUJI = { src: 'https://upload.wikimedia.org/fuji.jpg', alt: 'Mount Fuji at dawn', caption: 'From Lake Kawaguchi', credit: 'Jane Doe, CC BY-SA 4.0', creditUrl: 'https://commons.wikimedia.org/wiki/File:Fuji.jpg' }
const PHOTOS = [FUJI, { src: 'https://upload.wikimedia.org/kyoto.jpg', alt: 'Kiyomizu-dera' }, { src: 'https://upload.wikimedia.org/nara.jpg', alt: 'Deer in Nara', caption: 'Nara Park' }]

describe('Image and Gallery validation', () => {
  it('accepts https photos with alt text', () => {
    expect(validateProps('Image', FUJI)).toEqual([])
    expect(validateProps('Gallery', { title: 'Japan', images: PHOTOS, columns: 3 })).toEqual([])
  })

  it('rejects non-https, relative, credentialed and script URLs and missing alt', () => {
    expect(validateProps('Image', { ...FUJI, src: 'http://example.com/a.jpg' }).join()).toMatch(/https/)
    expect(validateProps('Image', { ...FUJI, src: '/a.jpg' }).join()).toMatch(/absolute https/)
    expect(validateProps('Image', { ...FUJI, src: 'data:image/png;base64,AAAA' }).join()).toMatch(/data:/)
    expect(validateProps('Image', { ...FUJI, creditUrl: 'javascript:alert(1)' }).join()).toMatch(/creditUrl/)
    expect(validateProps('Image', { ...FUJI, src: 'https://u:p@example.com/a.jpg' }).join()).toMatch(/credentials/)
    expect(validateProps('Image', { src: FUJI.src }).join()).toMatch(/alt: required/)
    expect(validateProps('Image', { ...FUJI, alt: '  ' }).join()).toMatch(/alt: must describe/)
  })

  it('bounds the gallery', () => {
    expect(validateProps('Gallery', { images: [] }).join()).toMatch(/at least 1 image/)
    expect(validateProps('Gallery', { images: Array(25).fill(FUJI) }).join()).toMatch(/more than 24/)
    expect(validateProps('Gallery', { images: PHOTOS, columns: 2.5 }).join()).toMatch(/columns: expected integer/)
    expect(validateProps('Gallery', { images: [{ ...FUJI, src: 'ftp://x/a.jpg' }] }).join()).toMatch(/images\[0\]\.src/)
  })
})

describe('media policy', () => {
  it('allows any https source by default and restricts to configured origins', () => {
    expect(checkMedia(FUJI.src, DEFAULT_POLICY)).toEqual({ ok: true, url: FUJI.src })
    const only = { allowMedia: true, mediaOrigins: ['https://cdn.example.com'] }
    expect(checkMedia('https://cdn.example.com/a.jpg', only).ok).toBe(true)
    expect(checkMedia(FUJI.src, only)).toEqual({ ok: false, reason: 'blocked' })
    expect(checkMedia('http://cdn.example.com/a.jpg', only)).toEqual({ ok: false, reason: 'invalid' })
    expect(checkMedia(FUJI.src, { allowMedia: false, mediaOrigins: [] })).toEqual({ ok: false, reason: 'offline' })
  })

  it('reads media fields from persisted metadata', () => {
    expect(policyFromMeta({ policy: { mediaOrigins: ['https://a.example'], allowMedia: false } })).toMatchObject({ mediaOrigins: ['https://a.example'], allowMedia: false })
    expect(policyFromMeta({ policy: {} })).toMatchObject({ mediaOrigins: [], allowMedia: true })
  })
})

describe('Image rendering', () => {
  it('loads lazily without a Referer and shows caption and linked credit', () => {
    show('Image', FUJI)
    const img = host.querySelector<HTMLImageElement>('img.diui-photo-img')!
    expect(img.getAttribute('src')).toBe(FUJI.src)
    expect(img.getAttribute('alt')).toBe(FUJI.alt)
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img.dataset.status).toBe('loading')
    fire(img, 'load')
    expect(img.dataset.status).toBe('ready')
    expect(host.querySelector('.diui-photo-caption')!.textContent).toContain('From Lake Kawaguchi')
    const credit = host.querySelector<HTMLAnchorElement>('.diui-photo-credit a')!
    expect(credit.href).toBe(FUJI.creditUrl)
    expect(credit.rel).toBe('noopener noreferrer')
  })

  it('replaces a broken image with its description and a link to the original', () => {
    show('Image', FUJI)
    fire(host.querySelector('img')!, 'error')
    const fallback = host.querySelector('.diui-photo-fallback')!
    expect(fallback.getAttribute('role')).toBe('img')
    expect(fallback.textContent).toContain('Mount Fuji at dawn')
    expect(fallback.textContent).toContain(en['photo.failed'])
    expect(fallback.querySelector('a')!.getAttribute('href')).toBe(FUJI.src)
    expect(host.querySelector('img')).toBeNull()
  })

  it('never requests a source outside the media allowlist or in the offline bundle', () => {
    show('Image', FUJI, { mediaOrigins: ['https://cdn.example.com'] })
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.diui-photo-fallback')!.textContent).toContain(en['photo.blocked'])
    expect(host.querySelector('.diui-photo-fallback a')).toBeNull()
    show('Image', FUJI, { allowMedia: false })
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.diui-photo-fallback')!.textContent).toContain(en['photo.offline'])
  })

  it('opens a full-size viewer and closes it with Escape', () => {
    show('Image', FUJI)
    click(host.querySelector('.diui-photo-open')!)
    const dialog = host.querySelector('dialog.diui-lightbox')!
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(dialog.querySelector('img')!.getAttribute('src')).toBe(FUJI.src)
    expect(dialog.querySelector('.diui-lightbox-step')).toBeNull()
    expect(document.activeElement).toBe(dialog.querySelector('.diui-lightbox-close'))
    key(dialog, 'Escape')
    expect(host.querySelector('dialog')).toBeNull()
  })
})

describe('Gallery rendering', () => {
  it('lays out a grid and steps through the viewer with keys and buttons', () => {
    show('Gallery', { title: 'Japan', images: PHOTOS })
    expect(host.querySelector('.diui-gallery figcaption')!.textContent).toBe('Japan')
    expect(host.querySelectorAll('img.diui-gallery-img')).toHaveLength(3)
    expect(host.querySelector<HTMLElement>('.diui-gallery-grid')!.style.getPropertyValue('--diui-cols')).toBe('3')
    click(host.querySelectorAll('.diui-photo-open')[1]!)
    const dialog = () => host.querySelector('dialog.diui-lightbox')!
    const current = () => dialog().querySelector('img')!.getAttribute('alt')
    expect(current()).toBe('Kiyomizu-dera')
    expect(dialog().querySelector('.diui-lightbox-count')!.textContent).toBe('2 / 3')
    key(dialog(), 'ArrowRight')
    expect(current()).toBe('Deer in Nara')
    expect(dialog().textContent).toContain('Nara Park')
    key(dialog(), 'ArrowRight')
    expect(current()).toBe('Mount Fuji at dawn')
    click(dialog().querySelector('[data-dir="prev"]')!)
    expect(current()).toBe('Deer in Nara')
    click(dialog().querySelector('.diui-lightbox-close')!)
    expect(host.querySelector('dialog')).toBeNull()
  })

  it('keeps the other photos when one fails', () => {
    show('Gallery', { images: PHOTOS })
    fire(host.querySelectorAll('img')[1]!, 'error')
    expect(host.querySelectorAll('img')).toHaveLength(2)
    expect(host.querySelector('.diui-gallery-item .diui-photo-fallback')!.textContent).toContain('Kiyomizu-dera')
  })
})
