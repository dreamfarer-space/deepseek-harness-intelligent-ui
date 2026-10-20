import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Prose inside a composition. Raw HTML is switched off (`skipHtml`) and never
 * executed: react-markdown builds React elements only. Only https, http and
 * mailto links survive, and they open in a new tab; remote images become links
 * instead of loading third-party content. Everything else — headings, lists,
 * tables, quotes, code — renders natively, never as an HTML string.
 */
const COMPONENTS: Components = {
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  // Remote images would load third-party content into the host page; show a link instead.
  img: ({ src, alt }) => src
    ? <a href={src} target="_blank" rel="noopener noreferrer">{alt || src}</a>
    : <span>{alt ?? ''}</span>,
}

/** Drop every URL whose protocol is not explicitly allowed. */
export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:' ? parsed.href : ''
  } catch {
    return ''
  }
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="diui-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
