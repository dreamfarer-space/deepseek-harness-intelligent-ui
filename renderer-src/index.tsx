/**
 * Host-neutral browser entry for remote clients.
 * Contract: mount(element, {sendPrompt, onHeight}), render(snapshot), setTheme(), dispose().
 * No DSH session, Remote credentials or RPC APIs enter the renderer.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { catalogRevision, subscribeCatalog } from '../src/catalog/extensions.js'
import { validateTree } from '../src/catalog/catalog.js'
import { BridgeGuard } from '../client-src/bridge.ts'
import { DEFAULT_POLICY, policyFromMeta } from '../client-src/policy.ts'
import { STYLES } from '../client-src/styles.ts'
import { en, zh } from '../client-src/locales.ts'
import { renderNode, type UiNode, type RenderEnv } from '../client-src/catalog/components.tsx'
import { WidgetFrame } from '../client-src/widget/WidgetFrame.tsx'
import { Markdown } from '../client-src/compose/Markdown.tsx'
import type { WidgetPolicy } from '../client-src/policy.ts'
import type { Translate } from '../client-src/types/dsh.ts'

export interface PortableUiArtifact {
  kind: 'declarative' | 'widget' | 'composition'
  uiId: string
  version: number
  title?: string
  definition: Record<string, unknown>
  policy?: WidgetPolicy
}
export { resourceMode } from '../client-src/resources.ts'
export { createControlledRuntime } from '../src/controlled/runtime.js'
export interface RendererHost {
  controlled?: import('../client-src/controlled.ts').ControlledRuntime
  sessionId?: string
  sendPrompt(text: string): Promise<void>
  onHeight?(height: number): void
}
export interface MountedRenderer {
  render(artifact: PortableUiArtifact): void
  setTheme(mode: 'light' | 'dark'): void
  dispose(): void
}

const baseCss = [
  'html,body{margin:0;padding:0;background:transparent}',
  '.diui-remote{padding:6px;font:14px/1.5 system-ui,-apple-system,sans-serif}',
  '.diui-remote-title{font-weight:600;margin:0 0 8px;color:var(--ui-text)}',
  '.diui-remote-error{padding:12px;color:var(--ui-error)}',
  '.diui-remote-widget{max-width:100%}',
].join('')
const CSS = STYLES + '\n' + baseCss
const readDefinition = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

function Surface({ artifact, host, theme }: { artifact: PortableUiArtifact; host: RendererHost; theme: 'light' | 'dark' }) {
  useSyncExternalStore(subscribeCatalog, catalogRevision, catalogRevision)
  const definition = readDefinition(artifact.definition)
  const policy = useMemo(() => policyFromMeta({ policy: artifact.policy ?? DEFAULT_POLICY }), [artifact.policy])
  const [widgetErrors, setWidgetErrors] = useState<readonly string[]>([])
  const guard = useMemo(() => new BridgeGuard({ policy, armDelayMs: 200, minIntervalMs: 1000 }), [policy])
  const t = ((key: keyof typeof zh, vars?: Record<string, string | number>) => {
    // English is the portable renderer default; consumers may provide locale in future.
    let v: string = en[key]
    for (const [name, value] of Object.entries(vars ?? {})) v = v.replace('{' + name + '}', String(value))
    return v
  }) as Translate
  const vars: Record<string, string> = theme === 'dark'
    ? { '--ui-bg': '#151517', '--ui-surface': '#232324', '--ui-text': '#f9fafb', '--ui-muted': '#adb2b8', '--ui-border': '#ffffff1f', '--ui-accent': '#7aaaff', '--ui-accent-text': '#151517', '--ui-success': '#22c55e', '--ui-warning': '#f59e0b', '--ui-error': '#f25a5a', '--ui-radius': '8px', '--ui-font': 'system-ui, sans-serif', '--ui-mono': 'monospace' }
    : { '--ui-bg': '#ffffff', '--ui-surface': '#f5f6f7', '--ui-text': '#0f1115', '--ui-muted': '#81858c', '--ui-border': '#0000001a', '--ui-accent': '#4176e6', '--ui-accent-text': '#ffffff', '--ui-success': '#22c55e', '--ui-warning': '#f59e0b', '--ui-error': '#ec1313', '--ui-radius': '8px', '--ui-font': 'system-ui, sans-serif', '--ui-mono': 'monospace' }
  const title = artifact.title || (artifact.kind === 'widget' ? 'Widget' : 'UI')
  const invalid = !definition || (artifact.kind === 'declarative' && !validateTree(definition).ok)
    || (artifact.kind === 'composition' && !Array.isArray(definition.blocks))
  const nodes = useMemo(() => new Map<string, UiNode>(
    Array.isArray(definition?.components)
      ? definition.components.filter((node): node is UiNode =>
          !!node && typeof node === 'object' && typeof node.id === 'string' && typeof node.type === 'string'
        ).map(node => [node.id, node])
      : [],
  ), [definition])
  const env: RenderEnv = {
    nodes, streaming: false, t, callId: artifact.uiId, policy,
    controlled: host.controlled, sessionId: host.sessionId,
    send: text => host.sendPrompt(guard.admitPrompt(text)),
  }
  return (
    <div className="diui diui-remote" style={vars}>
      <div className="diui-remote-title">{title}</div>
      {invalid ? <div className="diui-remote-error">Unsupported or invalid UI definition</div>
        : artifact.kind === 'declarative'
          ? <div className="diui-render">{renderNode(String(definition.root), env)}</div>
          : artifact.kind === 'composition'
            ? <div className="diui-compose">
                {(definition.blocks as any[]).map((block, i) => {
                  if (!block || typeof block !== 'object') return null
                  if (block.type === 'markdown') return <Markdown key={i} text={typeof block.text === 'string' ? block.text : ''} />
                  if (block.type === 'catalog') {
                    const nodes = new Map<string, UiNode>(Array.isArray(block.components)
                      ? block.components.filter((n: unknown): n is UiNode => !!n && typeof n === 'object' && typeof (n as UiNode).id === 'string' && typeof (n as UiNode).type === 'string').map((n: UiNode) => [n.id, n])
                      : [])
                    return <div className="diui-render" key={i}>{renderNode(String(block.root), { ...env, nodes, callId: `${artifact.uiId}#${block.id}` })}</div>
                  }
                  if (block.type !== 'widget' || typeof block.html !== 'string' || block.html === '') return null
                  return (
                    <div className="diui-remote-widget" key={i}>
                      <WidgetFrame
                        controlled={host.controlled}
                        sessionId={host.sessionId}
                        callId={`${artifact.uiId}#${block.id}`}
                        title={typeof block.title === 'string' ? block.title : 'Widget'}
                        mode="final"
                        persist={false}
                        css={typeof block.css === 'string' ? block.css : ''}
                        html={block.html}
                        jsFunctions={typeof block.jsFunctions === 'string' ? block.jsFunctions : ''}
                        jsExpressions={Array.isArray(block.jsExpressions) ? block.jsExpressions.filter((s: unknown): s is string => typeof s === 'string') : []}
                        initialHeight={typeof block.initialHeight === 'number' ? block.initialHeight : undefined}
                        policy={policy}
                        onErrors={setWidgetErrors}
                        sendPrompt={host.sendPrompt}
                      />
                    </div>
                  )
                })}
              </div>
          : typeof definition.html !== 'string' || definition.html.length === 0
            ? <div className="diui-remote-error">Invalid widget</div>
            : <div className="diui-remote-widget">
                <WidgetFrame
                  controlled={host.controlled}
                  sessionId={host.sessionId}
                  callId={artifact.uiId}
                  title={title}
                  mode="final"
                  persist={false}
                  css={typeof definition.css === 'string' ? definition.css : ''}
                  html={definition.html}
                  jsFunctions={typeof definition.jsFunctions === 'string' ? definition.jsFunctions : ''}
                  jsExpressions={Array.isArray(definition.jsExpressions) ? definition.jsExpressions.filter((s): s is string => typeof s === 'string') : []}
                  initialHeight={typeof definition.initialHeight === 'number' ? definition.initialHeight : undefined}
                  policy={policy}
                  onErrors={setWidgetErrors}
                  sendPrompt={host.sendPrompt}
                />
                {widgetErrors.length > 0 && <div className="diui-remote-error">Widget script error: {widgetErrors[0]}</div>}
              </div>}
    </div>
  )
}

/** Mount exactly once per WebView page; render() is safe to repeat for ui_patch. */
export function mount(element: HTMLElement, host: RendererHost): MountedRenderer {
  const root = createRoot(element)
  const css = document.createElement('style')
  css.textContent = CSS
  document.head.appendChild(css)
  let disposed = false
  let current: PortableUiArtifact | undefined
  let theme: 'light' | 'dark' = 'light'
  const observer = new ResizeObserver(() => host.onHeight?.(Math.ceil(document.documentElement.scrollHeight)))
  observer.observe(document.documentElement)
  const paint = () => {
    if (!disposed && current) root.render(<Surface key={current.uiId} artifact={current} host={host} theme={theme} />)
  }
  return {
    render(value) {
      if (disposed) return
      if (value.version < 1 || !Number.isSafeInteger(value.version) || !value.uiId) return
      if (current && value.uiId === current.uiId && value.version < current.version) return
      current = value
      paint()
    },
    setTheme(value) { if (!disposed && theme !== value) { theme = value; document.documentElement.style.colorScheme = value; paint() } },
    dispose() { if (disposed) return; disposed = true; observer.disconnect(); root.unmount(); css.remove() },
  }
}

export { registerComponentExtension, CATALOG_API_VERSION } from '../client-src/catalog/extensions.tsx'
export type { CatalogExtension, ComponentDefinition, ExtensionHandle, InferProps, ExtensionRenderContext, ExtensionRenderers } from '../client-src/catalog/extensions.tsx'
