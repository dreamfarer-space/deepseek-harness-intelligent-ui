// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getUiState, MAX_STATE_CHARS, resetUiStateMemory, setUiState } from '../client-src/state.ts'

beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
})

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
})
