// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUiState, MAX_STATE_CHARS, resetUiStateMemory, setPersistentUiState, setUiState } from '../client-src/state.ts'

beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ui state store', () => {
  it('keeps values per call and restores them from storage after a reload', () => {
    expect(setUiState('call-1', 'form:values', { n: 3 })).toBe(true)
    setUiState('call-1', 'tabs:tab', 2)
    setUiState('call-2', 'tabs:tab', 1)
    expect(getUiState('call-1', 'form:values')).toEqual({ n: 3 })
    resetUiStateMemory() // simulates a page reload
    expect(getUiState('call-1', 'tabs:tab')).toBe(2)
    expect(getUiState('call-2', 'tabs:tab')).toBe(1)
    expect(getUiState('call-3', 'tabs:tab')).toBeUndefined()
  })

  it('refuses oversized or unserializable state and survives corrupt storage', () => {
    expect(setUiState('c', 'big', 'x'.repeat(MAX_STATE_CHARS))).toBe(false)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(setUiState('c', 'cyclic', cyclic)).toBe(false)
    expect(getUiState('c', 'big')).toBeUndefined()
    localStorage.setItem('diui:v1:bad', '{not json')
    expect(getUiState('bad', 'k')).toBeUndefined()
  })

  it('preserves the previous recovery value on write failure while ordinary UI state still works', () => {
    expect(setPersistentUiState('call', 'launch', { accepted: false })).toBe(true)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(setPersistentUiState('call', 'launch', { accepted: true })).toBe(false)
    expect(getUiState('call', 'launch')).toEqual({ accepted: false })
    expect(setPersistentUiState('call', 'newLaunch', { id: 'two' })).toBe(false)
    expect(getUiState('call', 'newLaunch')).toBeUndefined()
    expect(setUiState('call', 'form:values', { n: 3 })).toBe(true)
    expect(getUiState('call', 'form:values')).toEqual({ n: 3 })
    resetUiStateMemory()
    expect(getUiState('call', 'launch')).toEqual({ accepted: false })
    expect(getUiState('call', 'form:values')).toBeUndefined()
  })

  it('refuses unavailable storage without publishing a recovery value in memory', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(setPersistentUiState('call', 'launch', { id: 'one' })).toBe(false)
    expect(getUiState('call', 'launch')).toBeUndefined()
    expect(setUiState('call', 'selection', 'sqlite')).toBe(true)
    expect(getUiState('call', 'selection')).toBe('sqlite')
  })

  it.each(['discarded write', 'unreadable write'])('refuses a %s', mode => {
    if (mode === 'discarded write') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    else vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked') })
    expect(setPersistentUiState('call', 'launch', { id: 'one' })).toBe(false)
    expect(getUiState('call', 'launch')).toBeUndefined()
  })

  it('does not report a confirmed write as failed when eviction is unavailable', () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('cleanup failed') })
    expect(setPersistentUiState('call', 'launch', { id: 'one' })).toBe(true)
    resetUiStateMemory()
    expect(getUiState('call', 'launch')).toEqual({ id: 'one' })
  })
})
