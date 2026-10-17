/** Resolved by scripts/build-client.mjs (and aliased in vitest.config.ts): idiomorph's global build as text. */
declare module 'idiomorph-source' {
  const source: string
  export default source
}

/** Trusted build input, not a tool-result field or a host URL. */
declare module 'offline-resource-pack' {
  const pack: import('../resources.ts').ResourcePack | null
  export default pack
}
