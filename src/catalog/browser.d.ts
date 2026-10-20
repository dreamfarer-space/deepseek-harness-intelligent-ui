import type { createElement, ReactNode } from 'react';
import type { CatalogExtension, ExtensionHandle, InferProps } from './extensions.js';
export interface ExtensionRenderContext<P = Record<string, unknown>> {
  props: P;
  children: ReactNode[];
  nodeId: string;
  streaming: boolean;
  stopped: boolean;
  h: typeof createElement;
  sendPrompt(text: string): Promise<void>;
  invokeAction(actionId: string, args: unknown, event: Event, requestId?: string): Promise<unknown>;
}
export type ExtensionRenderers<M extends CatalogExtension> = {
  [C in M['components'][number] as C['name']]: (context: ExtensionRenderContext<InferProps<C['propsSchema']>>) => ReactNode
};
export function registerComponentExtension<const M extends CatalogExtension>(manifest: M, renderers: ExtensionRenderers<M>): ExtensionHandle;
export type { CatalogExtension, ComponentDefinition, ExtensionHandle, InferProps } from './extensions.js';
export { CATALOG_API_VERSION } from './extensions.js';
