export * from '../src/catalog/browser.js';
export const inject: string[];
export function apply(ctx: any): void;
export function promptSession(sessions: any, sessionId: string, text: string): Promise<void>;
export function createControlledRuntime(sessionId: string): any;
