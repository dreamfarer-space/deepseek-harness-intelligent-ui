import { Component, createElement, type ReactNode } from 'react'
import {
  registerCatalogExtension, extensionEntry,
  type CatalogExtension, type ComponentDefinition, type ExtensionHandle,
} from '../../src/catalog/extensions.js'
import { contextOf } from '../controlled.ts'
import { newRequestId } from '../../src/controlled/runtime.js'
import type { RenderEnv, UiNode } from './components.tsx'

import type { ExtensionRenderContext, ExtensionRenderers } from '../../src/catalog/browser.js'
export type { ExtensionRenderContext, ExtensionRenderers } from '../../src/catalog/browser.js'
type Renderer = (context: ExtensionRenderContext<any>) => ReactNode
const renderers = new WeakMap<ComponentDefinition, Renderer>()

/** Trusted browser installation only; no imports/URLs/code are read from model output. */
export function registerComponentExtension<const M extends CatalogExtension>(manifest: M, installed: ExtensionRenderers<M>): ExtensionHandle {
  const names = manifest.components.map(c => c.name)
  if (!installed || Object.keys(installed).length !== names.length || names.some(name => !Object.hasOwn(installed, name) || typeof (installed as Record<string, unknown>)[name] !== 'function')) {
    throw new Error('Catalog extension: supply exactly one trusted renderer per component')
  }
  const handle = registerCatalogExtension(manifest)
  for (const component of manifest.components) {
    renderers.set(extensionEntry(`${manifest.namespace}/${component.name}`)!, (installed as Record<string, Renderer>)[component.name]!)
  }
  return handle
}
export function extensionRenderer(type: string): Renderer | undefined {
  const entry = extensionEntry(type)
  return entry && renderers.get(entry)
}

/** Contains render/effect errors without taking the surrounding conversation down. */
export class ExtensionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="diui-node-error" role="alert">Component extension failed</div> : this.props.children }
}

/** Renderer identity is a component type, so trusted renderers can use React hooks. */
export function ExtensionSurface({ renderer: Renderer, node, env, children }: { renderer: Renderer; node: UiNode; env: RenderEnv; children: ReactNode[] }) {
  const installation = extensionEntry(node.type)
  const live = () => {
    const entry = extensionEntry(node.type)
    if (!entry || entry !== installation || extensionRenderer(node.type) !== Renderer || entry.version !== node.componentVersion || env.streaming || env.stopped) throw new Error('Component extension unavailable or not ready')
    return entry
  }
  const context: ExtensionRenderContext = {
    props: node.props ?? {}, children, nodeId: node.id,
    streaming: env.streaming, stopped: !!env.stopped, h: createElement,
    async sendPrompt(text) { live(); await env.send(text) },
    async invokeAction(actionId, args, event, requestId = newRequestId()) {
      const entry = live()
      if (!entry.actions.includes(actionId)) throw new Error('Action not declared by this extension')
      if (!env.controlled) throw new Error('Actions are unavailable in this host')
      return env.controlled.invokeAction(contextOf(env), { actionId, args, requestId }, event)
    },
  }
  return <Renderer {...context} />
}
export type { CatalogExtension, ComponentDefinition, ExtensionHandle, InferProps } from '../../src/catalog/extensions.js'
export { CATALOG_API_VERSION } from '../../src/catalog/extensions.js'
