// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { en } from '../client-src/locales.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { validateProps } from '../src/catalog/catalog.js'
import { embedSource } from '../src/catalog/video.js'

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

function show(props: Record<string, unknown>, policy?: Record<string, unknown>) {
  const args = { root: 'n', components: [{ id: 'n', type: 'Video', props }] }
  act(() => root.render(<RenderView callId="v1" toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
    block={{ kind: 'tool-result', callId: 'v1', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true, ...(policy ? { policy } : {}) } }} />))
}
const click = (el: Element) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const BV = 'https://www.bilibili.com/video/BV1GJ411x7h7/?p=2'
const FILE = 'https://media.example.com/clip.webm'

describe('video links', () => {
  it('maps platform page links onto official players rebuilt from the id', () => {
    for (const link of [YT, 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ']) {
      expect(embedSource(link)!.player(false)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1')
    }
    expect(embedSource(YT, 42.7)!.player(true)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1&start=42&autoplay=1')
    expect(embedSource(YT, 42)!.page).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')
    const bv = embedSource(BV)!
    expect(bv.player(false)).toBe('https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&page=2&high_quality=1&danmaku=0&autoplay=0')
    expect(bv.page).toBe('https://www.bilibili.com/video/BV1GJ411x7h7/?p=2')
    expect(embedSource('https://vimeo.com/76979871')!.player(true)).toBe('https://player.vimeo.com/video/76979871?dnt=1&autoplay=1')
    expect(embedSource(FILE)).toBeUndefined()
  })

  it('never carries injected text into the player URL', () => {
    expect(embedSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ"onload=x')).toBeUndefined()
    expect(embedSource('https://www.youtube.com/watch?v=../../evil')).toBeUndefined()
    expect(embedSource('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeUndefined()
    expect(embedSource('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeUndefined()
  })
})

describe('Video validation', () => {
  it('accepts platform links and https files', () => {
    for (const src of [YT, BV, 'https://vimeo.com/76979871', FILE]) expect(validateProps('Video', { src, title: 'x', start: 5 })).toEqual([])
  })

  it('rejects non-https sources, unplayable platform links and bad options', () => {
    expect(validateProps('Video', { src: 'http://media.example.com/a.mp4' }).join()).toMatch(/https/)
    expect(validateProps('Video', { src: 'https://www.youtube.com/@channel' }).join()).toMatch(/not a playable YouTube video link/)
    expect(validateProps('Video', { src: 'https://b23.tv/abc' }).join()).toMatch(/not a playable Bilibili video link/)
    expect(validateProps('Video', { src: FILE, poster: 'data:image/png;base64,AA' }).join()).toMatch(/poster/)
    expect(validateProps('Video', { src: FILE, start: -1 }).join()).toMatch(/start/)
    expect(validateProps('Video', { src: FILE, aspectRatio: '21:9' }).join()).toMatch(/aspectRatio/)
  })
})

describe('Video rendering', () => {
  it('loads a platform player only after the user presses play', () => {
    show({ src: YT, title: 'Talk', start: 30, poster: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' })
    expect(host.querySelector('iframe')).toBeNull()
    const facade = host.querySelector<HTMLButtonElement>('.diui-video-facade')!
    expect(facade.getAttribute('aria-label')).toBe('Play: Talk')
    expect(facade.textContent).toContain('YouTube')
    expect(facade.querySelector('img')!.getAttribute('referrerpolicy')).toBe('no-referrer')
    const open = host.querySelector<HTMLAnchorElement>('.diui-video-open')!
    expect(open.href).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')
    expect(open.textContent).toBe('Open on YouTube')
    click(facade)
    const frame = host.querySelector('iframe')!
    expect(frame.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1&start=30&autoplay=1')
    expect(frame.getAttribute('title')).toBe('Talk')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation')
    expect(frame.hasAttribute('allowfullscreen')).toBe(true)
  })

  it('plays a direct file with native controls and explains a failure', () => {
    show({ src: FILE, start: 5, aspectRatio: '4:3', caption: 'Demo', credit: 'Me', creditUrl: 'https://example.com' })
    const video = host.querySelector('video')!
    expect(video.getAttribute('src')).toBe(`${FILE}#t=5`)
    expect(video.hasAttribute('controls')).toBe(true)
    expect(video.getAttribute('preload')).toBe('metadata')
    expect(video.hasAttribute('autoplay')).toBe(false)
    expect(host.querySelector<HTMLElement>('.diui-video-stage')!.style.aspectRatio).toBe('4 / 3')
    expect(host.querySelector('.diui-photo-credit a')!.getAttribute('href')).toBe('https://example.com/')
    expect(host.querySelector('.diui-video-open')!.textContent).toBe('Open original video')
    act(() => { video.dispatchEvent(new Event('error')) })
    expect(host.querySelector('video')).toBeNull()
    expect(host.querySelector('.diui-video-fallback')!.textContent).toContain(en['video.failed'])
    expect(host.querySelector('.diui-video-open')).not.toBeNull()
  })

  it('follows the media allowlist (player origin for platforms) and the offline rule', () => {
    show({ src: YT }, { mediaOrigins: ['https://media.example.com'] })
    expect(host.querySelector('.diui-video-facade')).toBeNull()
    expect(host.querySelector('.diui-video-fallback')!.textContent).toContain(en['video.blocked'])
    show({ src: YT }, { mediaOrigins: ['https://www.youtube-nocookie.com'] })
    expect(host.querySelector('.diui-video-facade')).not.toBeNull()
    show({ src: FILE }, { allowMedia: false })
    expect(host.querySelector('video')).toBeNull()
    expect(host.querySelector('.diui-video-fallback')!.textContent).toContain(en['video.offline'])
  })
})
