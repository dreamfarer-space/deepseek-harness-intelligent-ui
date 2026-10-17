import { describe, expect, it, vi } from 'vitest'

const pack = vi.hoisted(() => ({
  modules: {
    katex: { source: 'export default {render(){}}; // </script><script>evil()</script>', imports: ['katex'] },
    three: { source: 'export class Mesh {}', imports: ['three', 'three/addons/controls/OrbitControls.js'] },
  },
  katexCss: '@font-face{font-family:test;src:url(data:font/woff2;base64,AAAA)}',
}))
vi.mock('offline-resource-pack', () => ({ default: pack }))
import { DEFAULT_POLICY } from '../client-src/policy.ts'
import { buildFrameDocument, contentSecurityPolicy } from '../client-src/widget/frame.ts'
import { libPayload, libSources } from '../client-src/catalog/LibFrame.tsx'

const input = { token: 'offline', mode: 'final' as const, html: '<p>offline</p>', css: '', theme: {}, policy: DEFAULT_POLICY }

describe('optional offline resource build', () => {
  it('blocks all remote origins even when persisted policy allows network', () => {
    const csp = contentSecurityPolicy({ ...DEFAULT_POLICY, allowNetwork: true, cdn: ['https://esm.sh', 'https://host.example'] })
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'unsafe-inline' 'unsafe-eval' blob:")
    expect(csp).not.toContain('https:')
    expect(csp.split(';').find(x => x.trim().startsWith('script-src'))).not.toContain('data:')
  })

  it('creates local Blob modules inside the frame with exact audited import names', () => {
    const doc = buildFrameDocument(input)
    expect(doc).toContain('URL.createObjectURL(new Blob([m.source]')
    expect(doc).toContain('three/addons/controls/OrbitControls.js')
    expect(doc).not.toContain('https://esm.sh')
    expect(doc).toContain('resourceMode: "offline"')
    expect(doc).not.toContain('</script><script>evil()')
    const script = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!).find(s => s.includes('var modules='))!
    expect(() => new Function(script)).not.toThrow()
  })

  it('catalog frames embed only their required module and self-contained CSS/fonts', () => {
    const doc = buildFrameDocument({ ...input, resourceLibraries: ['katex'] })
    expect(doc).toContain('render()')
    expect(doc).not.toContain('export class Mesh')
    const src = libSources({ ...DEFAULT_POLICY, cdn: [] })!
    expect(src.katexJs).toBe('katex')
    const math = libPayload('math', 'x', {}, src)
    expect(math.css).toContain('data:font/woff2;base64,AAAA')
    expect(math.css).not.toContain('@import')
    expect(math.js).toContain('import("katex")')
    expect(math.js).toContain('Static fallback:')
    expect(math.html).toContain('role="status"')
    expect(libPayload('mermaid', 'graph TD; A-->B', {}, src).js).toContain('import("mermaid")')
  })
})
