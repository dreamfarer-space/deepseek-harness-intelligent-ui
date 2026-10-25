// Browser-only harness for the real production component, bundled by the audit.
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { WidgetFrame, type WidgetFrameProps } from '../../client-src/widget/WidgetFrame.tsx'
import { DEFAULT_POLICY } from '../../client-src/policy.ts'

const root = createRoot(document.getElementById('root')!)
let props: WidgetFrameProps
const api = window as any
api.widgetMount = (extra = {}) => {
  flushSync(() => root.render(null))
  api.promptPending = false
  props = {
    callId: 'audit', mode: 'final', title: 'Audit widget', policy: { ...DEFAULT_POLICY, cdn: [] },
    css: '', html: '<p id="x">widget</p>', generation: 0, persist: false,
    sendPrompt: () => new Promise<void>(resolve => { api.promptPending = true; api.resolvePrompt = resolve }),
    ...extra,
  }
  flushSync(() => root.render(<WidgetFrame {...props} />))
}
api.widgetPatch = (extra = {}) => {
  props = { ...props, ...extra }
  flushSync(() => root.render(<WidgetFrame {...props} />))
}
