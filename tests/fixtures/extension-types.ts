// Compile this against the same declarations shipped to external extensions.
import type { CatalogExtension, InferProps } from 'deepseek-harness-intelligent-ui/catalog'
import type { ExtensionRenderers } from 'deepseek-harness-intelligent-ui/client'
const manifest = {
  apiVersion: 1, namespace: 'typed.control', version: '1.0.0', components: [{
    name: 'RootLocusPlot', description: 'Typed poles',
    propsSchema: { type: 'object', additionalProperties: false, required: ['gain'], properties: {
      gain: { type: 'number', minimum: 0 }, caption: { type: 'string' },
      mode: { type: 'string', enum: ['real', 'complex'] },
      points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['x'], properties: { x: { type: 'number' } } } },
    } },
  }],
} as const satisfies CatalogExtension
const renderers: ExtensionRenderers<typeof manifest> = {
  RootLocusPlot({ props, h }) {
    const gain: number = props.gain
    const caption: string | undefined = props.caption
    const mode: 'real' | 'complex' | undefined = props.mode
    // @ts-expect-error Unknown props must not lose type safety.
    props.arbitrary
    // @ts-expect-error Numeric props cannot be assigned to strings.
    const wrong: string = props.gain
    return h('p', null, `${gain} ${caption} ${mode} ${props.points?.[0]?.x}`)
  },
}
type Props = InferProps<typeof manifest.components[0]['propsSchema']>
// @ts-expect-error Required gain is not optional.
const missing: Props = {}
// @ts-expect-error Enum literals remain specific.
const invalid: Props = { gain: 1, mode: 'unknown' }
void renderers
