// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ComposeView } from '../client-src/compose/ComposeView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { resetUiStateMemory, getUiState } from '../client-src/state.ts'
import { resetUiVersions, noteUiVersion } from '../client-src/versions.ts'
import { snapshotOf, applyPatch } from '../src/catalog/patch.js'
import { validateComposition, compositionFieldKeys } from '../src/compose/compose.js'
import { en } from '../client-src/locales.ts'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { localStorage.clear(); resetUiStateMemory(); resetUiVersions(); host=document.createElement('div');document.body.appendChild(host);root=createRoot(host) })
afterEach(() => {act(()=>root.unmount());host.remove()})
const t = (key: string, vars?: any) => (en as any)[key].replace(/\{(\w+)\}/g, (_: any,k: string)=>String(vars?.[k]??''))
const base = (callId: string,toolName:string) => ({callId,toolName,t,sendPrompt:vi.fn(async()=>{})})
const result = (callId:string,args:any,name:string,meta:any={ok:true}) => ({kind:'tool-result' as const,callId,call:{name,argsRaw:JSON.stringify(args)},content:[],isError:false,meta})
const field = (name='qty',def=20) => ({name,label:name,type:'range',default:def,min:0,max:100})
const form = (id:string, name='qty',def=20) => ({id,type:'Form',props:{fields:[field(name,def)]}})
const controls = {id:'controls',type:'catalog',root:'s',components:[{id:'s',type:'Stack',children:['f']},form('f')]}
const report = {id:'report',type:'catalog',root:'p',computed:[{id:'total',expr:'qty * 2'}],components:[{id:'p',type:'Progress',props:{value:{$computed:'total'}}}]}
const value = () => host.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')
const edit = (v:string) => {const el=host.querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))}
function patchSnapshot(block:any,blocks:any[],ops:any[]) {const ui={...snapshotOf(`cmp#${block.id}`,block),scope:[...compositionFieldKeys(blocks)]}; const p=applyPatch(ui,{uiId:ui.uiId,baseVersion:1,ops});expect(p.ok).toBe(true);return p.ui}
function compose(args:any) {return <ComposeView {...base('cmp','ui_compose')} phase="result" block={result('cmp',args,'ui_compose')} />}
function patch(ui:any,id='patch') {return <PatchView {...base(id,'ui_patch')} phase="result" block={result(id,{},'ui_patch',{ok:true,ui})} />}
it('removing a producer clears the value of its unpatched sibling consumer',()=>{
 const args={blocks:[controls,report]};expect(validateComposition(args,{}).ok).toBe(true)
 act(()=>root.render(compose(args)));act(()=>edit('70'));expect(value()).toBe('140')
 const ui=patchSnapshot(controls,args.blocks,[{op:'removeNode',id:'f'}]);act(()=>noteUiVersion(ui.uiId,2))
 act(()=>root.render(<>{compose(args)}{patch(ui)}</>));
 console.log(JSON.stringify({probe:'removed-producer-unpatched-consumer',inputs:host.querySelectorAll('input').length,progress:value(),stored:getUiState('cmp','qty'),stale:ui.staleFields}))
 expect(host.querySelectorAll('input')).toHaveLength(0);expect(value()).toBe('0')
})
it('removing a producer clears the value of a previously patched sibling consumer',()=>{
 const args={blocks:[controls,report]};expect(validateComposition(args,{}).ok).toBe(true)
 act(()=>root.render(compose(args)));act(()=>edit('70'))
 const rep=patchSnapshot(report,args.blocks,[{op:'setProps',id:'p',props:{max:200}}]);act(()=>noteUiVersion(rep.uiId,2))
 act(()=>root.render(<>{compose(args)}{patch(rep,'report-patch')}</>));expect(value()).toBe('140')
 const ctl=patchSnapshot(controls,args.blocks,[{op:'removeNode',id:'f'}]);act(()=>noteUiVersion(ctl.uiId,2))
 act(()=>root.render(<>{compose(args)}{patch(rep,'report-patch')}{patch(ctl,'controls-patch')}</>));
 console.log(JSON.stringify({probe:'removed-producer-patched-consumer',inputs:host.querySelectorAll('input').length,progress:value(),consumerScope:rep.scope,producerStale:ctl.staleFields}))
 expect(host.querySelectorAll('input')).toHaveLength(0);expect(value()).toBe('0')
})
it('retiring an own key keeps a live sibling publishing the same shared key readable',()=>{
 const own={id:'own',type:'catalog',root:'s',computed:report.computed,components:[{id:'s',type:'Stack',children:['f','p']},form('f'),report.components[0]]}
 const sibling={id:'sibling',type:'catalog',root:'f2',components:[form('f2')]}
 const args={blocks:[own,sibling]};expect(validateComposition(args,{}).ok).toBe(true)
 act(()=>root.render(compose(args)))
 const ui=patchSnapshot(own,args.blocks,[{op:'removeNode',id:'f'}]);act(()=>noteUiVersion(ui.uiId,2))
 act(()=>root.render(<>{compose(args)}{patch(ui)}</>));act(()=>edit('70'))
 console.log(JSON.stringify({probe:'live-sibling-key',progress:value(),inputs:host.querySelectorAll('input').length,stored:getUiState('cmp','qty'),stale:ui.staleFields}))
 expect(value()).toBe('140')
})
it('a block patch cannot introduce a field key colliding with a sibling computed id',()=>{
 const args={blocks:[controls,report]};expect(validateComposition(args,{}).ok).toBe(true)
 const ui={...snapshotOf('cmp#controls',controls),scope:[...compositionFieldKeys(args.blocks)]}
 const patched=applyPatch(ui,{uiId:ui.uiId,baseVersion:1,ops:[{op:'setProps',id:'f',props:{fields:[field('qty'),field('total')]}}]})
 const full=patched.ok?validateComposition({blocks:[{...controls,components:patched.ui.components},report]},{}):undefined
 console.log(JSON.stringify({probe:'patch-global-collision',accepted:patched.ok,fullCompositionErrors:full?.errors}))
 expect(patched.ok).toBe(false)
})
