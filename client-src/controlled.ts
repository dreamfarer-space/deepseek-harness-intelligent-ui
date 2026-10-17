import { createControlledRuntime } from '../src/controlled/runtime.js'
export type ControlledRuntime = ReturnType<typeof createControlledRuntime>
export interface DataRef { id: string; scope: string }
export interface ActionRequest { actionId: string; args: unknown; requestId: string }
export interface ControlledEnv { controlled?: ControlledRuntime; sessionId?: string; callId?: string }
export function contextOf(env: ControlledEnv) { return { sessionId: env.sessionId, uiId: env.callId } }
