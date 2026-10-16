// A minimal stand-in for DSH's agent loop, for the API stage of the real-model
// evaluation: model → the plugin's own tool execute() → tool results back to
// the model, until it answers without tools. ui_patch sees the conversation
// exactly like it does in DSH (the session's message history), so in-place
// updates are scored on the UI the user would end up with.
import { collectUis } from '../../src/catalog/patch.js'
import { RENDER_TOOL } from '../../src/tools/render.js'
import { PATCH_TOOL } from '../../src/tools/patch.js'

export const MAX_STEPS = 4

export class Conversation {
  /**
   * @param {(messages: any[]) => Promise<{ message: any, model: string, fingerprint: string | null, ms: number }>} chat
   * @param {any[]} tools - the plugin's tool definitions (name, execute, output.render).
   */
  constructor(chat, tools) {
    this.chat = chat
    this.tools = new Map(tools.map(t => [t.name, t]))
    /** OpenAI-format history sent to the API. */
    this.messages = []
    /** DSH-format history, as `Session.deriveMessages()` returns it to ui_patch. */
    this.session = []
  }

  /** The current version of every UI in this conversation. */
  uis() {
    return collectUis(this.session, { render: RENDER_TOOL, patch: PATCH_TOOL })
  }

  /**
   * One user turn, including every tool round the model takes.
   * @returns {Promise<{ text: string, calls: any[], api: { ms: number, model: string, fingerprint: string | null }[], steps: number, exhausted: boolean }>}
   */
  async turn(text) {
    this.messages.push({ role: 'user', content: text })
    this.session.push({ role: 'user', content: [{ type: 'text', text }] })
    const calls = []
    const api = []
    let answer = ''
    for (let step = 1; step <= MAX_STEPS; step++) {
      const { message, ...meta } = await this.chat(this.messages)
      api.push(meta)
      answer = [answer, message.content || ''].filter(Boolean).join('\n')
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
      this.messages.push({ role: 'assistant', content: message.content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) })
      if (!toolCalls.length) return { text: answer, calls, api, steps: step, exhausted: false }
      this.session.push({ role: 'assistant', content: toolCalls.map(c => ({ type: 'tool-call', id: c.id, name: c.function?.name, arguments: c.function?.arguments })) })
      for (const call of toolCalls) calls.push(await this.#execute(call, step))
    }
    return { text: answer, calls, api, steps: MAX_STEPS, exhausted: true }
  }

  async #execute(call, step) {
    const name = call.function?.name
    const record = { id: call.id, name, step, ok: false, args: undefined, errors: [] }
    const tool = this.tools.get(name)
    let value
    if (!tool) value = { ok: false, summary: `Unknown tool ${name}.` }
    else {
      try { record.args = JSON.parse(call.function.arguments) } catch (e) { value = { ok: false, summary: `Arguments are not valid JSON: ${e.message}` } }
      if (!value) {
        try {
          value = await tool.execute(record.args, { callId: call.id, agent: { session: { deriveMessages: () => this.session } } })
        } catch (e) { value = { ok: false, summary: `Tool failed: ${e.message}` } }
      }
    }
    record.ok = value.ok === true
    record.errors = value.errors || (record.ok ? [] : [value.summary])
    const content = tool?.output?.render && value.summary !== undefined && record.args !== undefined
      ? tool.output.render(record.args, value).map(p => p.text).join('\n')
      : value.summary
    this.messages.push({ role: 'tool', tool_call_id: call.id, content })
    this.session.push({ role: 'tool', toolCallId: call.id, isError: false, content: [{ type: 'text', text: content }] })
    return record
  }
}
