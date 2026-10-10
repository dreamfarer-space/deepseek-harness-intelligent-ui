class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length(): number {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

if (typeof window !== 'undefined') {
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  } catch {
    // opaque origin SecurityError
  }
  if (!storage) {
    storage = new MemoryStorage()
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    })
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
}
