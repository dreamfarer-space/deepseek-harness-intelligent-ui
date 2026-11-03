// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { ComposeView } from '../client-src/compose/ComposeView.tsx'
import { getUiState, resetUiStateMemory } from '../client-src/state.ts'
import { noteUiVersion, resetUiVersions } from '../client-src/versions.ts'
import { validateTree } from '../src/catalog/catalog.js'
import { validateComposition, compositionFieldKeys } from '../src/compose/compose.js'
import { snapshotOf, applyPatch } from '../src/catalog/patch.js'
import { projectNativeUiEvents } from '../src/portable/artifacts.js'
import { en } from '../client-src/locales.ts'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const t = (key: string, vars?: any) => (en as any)[key].replace(/\{(\w+)\}/g, (_: any, k: string) => String(vars?.[k] ?? ''))
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { localStorage.clear(); resetUiStateMemory(); resetUiVersions(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })
const base = (callId: string, toolName = 'ui_render') => ({callId, toolName, t, sendPrompt: vi.fn(async () => {})})
const result = (callId: string, args: any, meta: any = {ok:true}, name = 'ui_render') => ({kind:'tool-result' as const,callId,call:{name,argsRaw:JSON.stringify(args)},content:[],isError:false,meta})
const field = (name: string, extra: any = {}) => ({name,label:name,type:'range',min:0,max:100,default:20,...extra})
const input = (v: string) => { const el = host.querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})) }
const value = () => host.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')
function calc(name: string) { return {root:'s',computed:[{id:'total',expr:`${name} * 2`}],components:[{id:'s',type:'Stack',children:['f','p']},{id:'f',type:'Form',props:{fields:[field(name)]}},{id:'p',type:'Progress',props:{value:{$computed:'total'}}}]}}
it.each(['constructor','toString','__proto__'])('prototype-named field %s must work from initial mount and edits', name => {
 const tree=calc(name); expect(validateTree(tree).ok).toBe(true)
 act(() => root.render(<RenderView {...base('proto')} phase="result" block={result('proto',tree)} />))
 const initial = value(); act(() => input('30')); const edited = value()
 console.log(JSON.stringify({probe:'prototype-field',name,initial,edited,sharedType:typeof getUiState('proto',name)}))
 expect({initial,edited}).toEqual({initial:'40',edited:'60'})
})
it('multi-field form bindKey accepted by Host must not become an unreadable formula variable', () => {
 const tree = {root:'s',computed:[{id:'total',expr:'amount * 2'}],components:[{id:'s',type:'Stack',children:['f','p']},{id:'f',type:'Form',props:{bindKey:'amount',fields:[field('qty'),field('price')]}},{id:'p',type:'Progress',props:{value:{$computed:'total'}}}]}
 const check = validateTree(tree)
 act(() => root.render(<RenderView {...base('multi')} phase="result" block={result('multi',tree)} />))
 const initial = value(); act(() => input('70')); const edited = value()
 console.log(JSON.stringify({probe:'multi-field-form-key-validation',ok:check.ok,errors:check.errors,initial,edited,shared:getUiState('multi','amount')}))
 // A multi-field scalar binding is undefined by the renderer; reject this name at validation.
 expect(check.ok).toBe(false)
})
const controls = {id:'controls',type:'catalog',root:'f',components:[{id:'f',type:'Form',props:{fields:[field('qty')]}}]}
const report = {id:'report',type:'catalog',root:'p',computed:[{id:'total',expr:'qty * 2'}],components:[{id:'p',type:'Progress',props:{value:{$computed:'total'}}}]}
it('patched controls without explicit bindKey continue to drive sibling formulas', () => {
 const args={blocks:[controls,report]}; expect(validateComposition(args,{}).ok).toBe(true)
 const ui={...snapshotOf('cmp#controls',controls),scope:[...compositionFieldKeys(args.blocks)]}
 const patched=applyPatch(ui,{uiId:ui.uiId,baseVersion:1,ops:[{op:'setProps',id:'f',props:{title:'Patched'}}]}); expect(patched.ok).toBe(true)
 act(() => root.render(<ComposeView {...base('cmp','ui_compose')} phase="result" block={result('cmp',args,{ok:true},'ui_compose')} />))
 expect(value()).toBe('40')
 act(() => noteUiVersion('cmp#controls',2))
 act(() => root.render(<><ComposeView {...base('cmp','ui_compose')} phase="result" block={result('cmp',args,{ok:true},'ui_compose')} /><PatchView {...base('patch','ui_patch')} phase="result" block={result('patch',{}, {ok:true,ui:patched.ui},'ui_patch')} /></>))
 act(() => input('70'))
 console.log(JSON.stringify({probe:'patched-control',progress:value(),shared:getUiState('cmp','qty'),private:getUiState('cmp#controls','f:values')}))
 expect(value()).toBe('140')
})
const call=(seq:number,id:string,name:string,args:any)=>({type:'tool/call',seq,data:{callId:id,name,arguments:JSON.stringify(args)}})
const done=(seq:number,id:string,meta:any)=>({type:'tool/result',seq,data:{message:{source:{callId:id},content:[],isError:false},meta}})
it('portable projection accepts a host-approved cross-block computed patch', () => {
 const args={blocks:[controls,report]}; expect(validateComposition(args,{}).ok).toBe(true)
 const ui={...snapshotOf('cmp#report',report),scope:[...compositionFieldKeys(args.blocks)]}
 const patch={uiId:ui.uiId,baseVersion:1,ops:[{op:'setProps',id:'p',props:{max:200}}]}
 const patched=applyPatch(ui,patch); expect(patched.ok).toBe(true)
 const [artifact]=projectNativeUiEvents([call(1,'cmp','ui_compose',args),done(2,'cmp',{ok:true}),call(3,'patch','ui_patch',patch),done(4,'patch',{ok:true,ui:patched.ui})],{hostId:'h',sessionId:'s'})
 console.log(JSON.stringify({probe:'portable-patch',version:artifact.version,max:artifact.definition.blocks[1].components[0].props.max}))
 expect(artifact.version).toBe(2)
 expect(artifact.definition.blocks[1].components[0].props.max).toBe(200)
})
it('patch scope cannot reintroduce a removed own input as a phantom value', () => {
 const own={...controls,root:'s',computed:[{id:'total',expr:'qty * 2'}],components:[{id:'s',type:'Stack',children:['f','p']},...controls.components,{id:'p',type:'Progress',props:{value:{$computed:'total'}}}]}
 const args={blocks:[own]}; expect(validateComposition(args,{}).ok).toBe(true)
 const ui={...snapshotOf('cmp#controls',own),scope:[...compositionFieldKeys(args.blocks)]}
 act(() => root.render(<ComposeView {...base('cmp','ui_compose')} phase="result" block={result('cmp',args,{ok:true},'ui_compose')} />)); expect(value()).toBe('40')
 const patched=applyPatch(ui,{uiId:ui.uiId,baseVersion:1,ops:[{op:'removeNode',id:'f'}]}); expect(patched.ok).toBe(true)
 act(() => noteUiVersion(ui.uiId,2))
 act(() => root.render(<PatchView {...base('patch','ui_patch')} phase="result" block={result('patch',{}, {ok:true,ui:patched.ui},'ui_patch')} />))
 console.log(JSON.stringify({probe:'removed-own-field',inputs:host.querySelectorAll('input').length,value:value(),scope:patched.ui.scope}))
 expect(host.querySelector('input')).toBeNull(); expect(value()).toBe('0')
})
