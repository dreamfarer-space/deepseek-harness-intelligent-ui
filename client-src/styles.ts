/**
 * Host-side styles for the tool cards and catalog components. Injected once
 * as a <style> element by the client plugin (removed on unload). All colors
 * come from the host's design tokens with sane fallbacks.
 */
export const STYLES = `
.diui{
  --ui-bg:var(--dsw-alias-bg-base,#fff);
  --ui-surface:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 4%,var(--dsw-alias-bg-base,#fff));
  --ui-text:var(--dsw-alias-label-primary,#0f1115);
  --ui-muted:var(--dsw-alias-label-tertiary,#81858c);
  --ui-border:var(--dsw-alias-border-l2,#0000001a);
  --ui-accent:var(--dsw-alias-state-business-primary,#4176e6);
  --ui-accent-text:var(--dsw-alias-label-primary-inverted,#fff);
  --ui-success:var(--dsw-alias-state-success-primary,#22c55e);
  --ui-warning:var(--dsw-alias-state-warn-primary,#f59e0b);
  --ui-error:var(--dsw-alias-state-error-primary,#ec1313);
  --ui-radius:var(--dsw-radius-sm,8px);
  color:var(--ui-text);
  font-size:var(--dsh-content-font-size,14px);
  line-height:1.5;
}
.diui-shell{border:1px solid var(--ui-border);border-radius:calc(var(--ui-radius) + 6px);overflow:hidden;margin:8px 0;background:var(--ui-bg);max-width:100%;container-type:inline-size;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.diui-shell-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:7px 12px;color:var(--ui-muted);font-size:12px;min-height:32px}
.diui-shell:has(.diui-shell-body) .diui-shell-head{border-bottom:1px solid var(--ui-border)}
.diui-shell-icon{color:var(--ui-accent);font-size:13px;line-height:1}
.diui-shell-title{font-weight:600;color:var(--ui-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:0 1 auto}
.diui-shell-status{margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}
.diui-shell-actions{display:inline-flex;gap:6px;margin-left:auto}
.diui-shell-status+.diui-shell-actions{margin-left:0}
.diui-head-button{font:inherit;font-size:12px;border:1px solid var(--ui-border);background:var(--ui-bg);color:var(--ui-text);border-radius:999px;padding:2px 10px;cursor:pointer}
.diui-head-button:hover:not(:disabled){border-color:var(--ui-accent);color:var(--ui-accent)}
.diui-head-button:disabled{opacity:.55;cursor:default}
.diui-head-button:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.diui-shell-notice{padding:6px 12px;font-size:12px;color:var(--ui-warning);background:var(--ui-surface);border-bottom:1px solid var(--ui-border)}
.diui-shell[data-plain]{border:0;border-radius:0;box-shadow:none;background:transparent;margin:0}
.diui-shell[data-plain] .diui-shell-head{padding-left:0;padding-right:0}
.diui-shell[data-plain] .diui-shell-body{background:transparent}
.diui-shell[data-state=error] .diui-shell-icon{color:var(--ui-error)}
.diui-shell[data-state=stopped] .diui-shell-icon{color:var(--ui-warning)}
.diui-error-count{color:var(--ui-error)}
.diui-shell-body{position:relative}
.diui-dots{display:inline-flex;gap:3px}
.diui-dots i{width:4px;height:4px;border-radius:50%;background:var(--ui-accent);animation:diui-blink 1.2s infinite ease-in-out}
.diui-dots i:nth-child(2){animation-delay:.2s}.diui-dots i:nth-child(3){animation-delay:.4s}
@keyframes diui-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
.diui-frame{display:block;width:100%;border:0;background:transparent;transition:height .18s ease;color-scheme:normal}
.diui-lib .diui-frame{transition:none}
.diui-src-preview{opacity:.7}
.diui-placeholder{padding:16px;display:flex;flex-direction:column;gap:10px}
.diui-skeleton,.diui-shimmer{height:56px;border-radius:var(--ui-radius);background:linear-gradient(90deg,var(--ui-surface) 25%,var(--ui-border) 50%,var(--ui-surface) 75%);background-size:200% 100%;animation:diui-shimmer 1.4s infinite linear}
.diui-shimmer{height:28px}
@keyframes diui-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.diui-placeholder-text{color:var(--ui-muted);font-size:13px}
.diui-placeholder>.diui-skeleton{flex:1 1 auto;min-height:56px}
.diui-problem{padding:10px 12px;color:var(--ui-muted);display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.diui-problem-detail{flex-basis:100%;margin:0;white-space:pre-wrap;font-size:12px;max-height:240px;overflow:auto;background:var(--ui-surface);padding:8px;border-radius:var(--ui-radius)}
.diui-link{border:0;background:none;color:var(--ui-accent);cursor:pointer;padding:0;font:inherit}
.diui-render{padding:14px;display:flex;flex-direction:column;gap:12px}
.diui-render>.diui-card:only-child{border:0;padding:0;background:transparent}
.diui-stack{display:flex;flex-direction:column;min-width:0}
.diui-stack[data-direction=horizontal]{flex-direction:row}
.diui-stack[data-direction=horizontal]>*{flex:1 1 0;min-width:0}
.diui-grid{display:grid;gap:10px;grid-template-columns:repeat(var(--diui-cols),minmax(0,1fr))}
@container (max-width:560px){.diui-grid{grid-template-columns:repeat(min(2,var(--diui-cols)),minmax(0,1fr))}.diui-stack[data-direction=horizontal]{flex-wrap:wrap}.diui-stack[data-direction=horizontal]>*{flex-basis:100%}.diui-render{padding:10px}}
@container (max-width:360px){.diui-grid{grid-template-columns:minmax(0,1fr)}}
.diui-card{border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:12px;background:var(--ui-surface);min-width:0}
.diui-card-head{margin-bottom:8px}
.diui-card-title{margin:0;font-size:15px}
.diui-card-subtitle{margin:2px 0 0;color:var(--ui-muted);font-size:13px}
.diui-card-foot{margin-top:10px;color:var(--ui-muted);font-size:12px}
.diui-text{margin:0}
.diui-text[data-variant=title]{font-size:18px;font-weight:600}
.diui-text[data-variant=heading]{font-size:15px;font-weight:600}
.diui-text[data-variant=caption]{font-size:12px;color:var(--ui-muted)}
.diui-text[data-tone=muted]{color:var(--ui-muted)}
.diui-text[data-tone=success]{color:var(--ui-success)}
.diui-text[data-tone=warning]{color:var(--ui-warning)}
.diui-text[data-tone=error]{color:var(--ui-error)}
.diui-text[data-tone=info]{color:var(--ui-accent)}
.diui-code-inline{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:.92em;background:var(--ui-surface);padding:0 4px;border-radius:4px}
.diui-code{margin:0;padding:10px;border-radius:var(--ui-radius);background:var(--ui-surface);border:1px solid var(--ui-border);overflow:auto;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12.5px}
.diui-alert{border-left:3px solid var(--ui-accent);background:var(--ui-surface);padding:8px 12px;border-radius:var(--ui-radius)}
.diui-alert[data-tone=success]{border-color:var(--ui-success)}
.diui-alert[data-tone=warning]{border-color:var(--ui-warning)}
.diui-alert[data-tone=error]{border-color:var(--ui-error)}
.diui-alert[data-tone=muted],.diui-alert[data-tone=default]{border-color:var(--ui-border)}
.diui-alert-title{display:block;margin-bottom:2px}
.diui-badge{display:inline-block;align-self:flex-start;font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--ui-border);color:var(--ui-muted)}
.diui-badge[data-tone=success]{color:var(--ui-success);border-color:currentColor}
.diui-badge[data-tone=warning]{color:var(--ui-warning);border-color:currentColor}
.diui-badge[data-tone=error]{color:var(--ui-error);border-color:currentColor}
.diui-badge[data-tone=info]{color:var(--ui-accent);border-color:currentColor}
.diui-divider{border:0;border-top:1px solid var(--ui-border);margin:4px 0;width:100%}
.diui-stat{border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:10px 12px;background:var(--ui-bg);min-width:0}
.diui-stat-label{color:var(--ui-muted);font-size:12px}
.diui-stat-value{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.3;overflow-wrap:anywhere}
.diui-stat-delta{font-size:12px;color:var(--ui-muted)}
.diui-stat-delta[data-trend=up]{color:var(--ui-success)}
.diui-stat-delta[data-trend=down]{color:var(--ui-error)}
.diui-stat-hint{font-size:12px;color:var(--ui-muted)}
.diui-progress-label{display:flex;justify-content:space-between;font-size:12px;color:var(--ui-muted);margin-bottom:4px}
.diui-progress-track{height:8px;border-radius:999px;background:var(--ui-surface);border:1px solid var(--ui-border);overflow:hidden}
.diui-progress-bar{height:100%;background:var(--ui-accent);transition:width .3s}
.diui-progress[data-tone=success] .diui-progress-bar{background:var(--ui-success)}
.diui-progress[data-tone=warning] .diui-progress-bar{background:var(--ui-warning)}
.diui-progress[data-tone=error] .diui-progress-bar{background:var(--ui-error)}
.diui-list{margin:0;padding-left:20px}
.diui-table-wrap{overflow:auto;max-height:480px;border:1px solid var(--ui-border);border-radius:var(--ui-radius)}
.diui-table{border-collapse:collapse;width:100%;font-size:13px}
.diui-table caption{caption-side:top;text-align:left;padding:6px 10px;color:var(--ui-muted);font-size:12px}
.diui-table th,.diui-table td{padding:6px 10px;border-bottom:1px solid var(--ui-border);text-align:left;vertical-align:top}
.diui-table th{position:sticky;top:0;background:var(--ui-surface);font-weight:600;white-space:nowrap;z-index:1}
.diui-table [data-numeric]{text-align:right;font-variant-numeric:tabular-nums}
.diui-table tbody tr:last-child td{border-bottom:0}
.diui-table tbody tr:hover{background:var(--ui-surface)}
.diui-th-button{border:0;background:none;font:inherit;color:inherit;cursor:pointer;padding:0}
.diui-diff{display:flex;flex-direction:column;gap:8px;min-width:0}
.diui-diff-summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12px;color:var(--ui-muted)}
.diui-diff-summary strong{color:var(--ui-text);font-size:13px}
.diui-diff-add{color:var(--ui-success);font-variant-numeric:tabular-nums}
.diui-diff-del{color:var(--ui-error);font-variant-numeric:tabular-nums}
.diui-diff-file{border:1px solid var(--ui-border);border-radius:var(--ui-radius);overflow:hidden}
.diui-diff-head{display:flex;align-items:center;gap:8px;width:100%;border:0;background:var(--ui-surface);color:var(--ui-text);font:inherit;font-size:12px;padding:6px 10px;cursor:pointer;text-align:left}
.diui-diff-head:focus-visible,.diui-tree-toggle:focus-visible,.diui-diff-skip:focus-visible,.diui-json-copy:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px}
.diui-diff-path{font-family:var(--dsh-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);overflow-wrap:anywhere;flex:1 1 auto;min-width:0}
.diui-diff-body{overflow:auto;max-height:520px;font-family:var(--dsh-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px;line-height:1.5}
.diui-diff-line{display:grid;grid-template-columns:auto auto 1.4em 1fr;min-width:max-content}
.diui-diff-line[data-op="+"]{background:color-mix(in srgb,var(--ui-success) 14%,transparent)}
.diui-diff-line[data-op="-"]{background:color-mix(in srgb,var(--ui-error) 14%,transparent)}
.diui-diff-no{color:var(--ui-muted);text-align:right;padding:0 6px;min-width:3.2em;user-select:none;border-right:1px solid var(--ui-border)}
.diui-diff-sign{text-align:center;user-select:none;color:var(--ui-muted)}
.diui-diff-text{white-space:pre;padding-right:12px;font:inherit;background:none}
.diui-diff-gap,.diui-diff-skip{display:block;width:100%;text-align:left;border:0;padding:2px 10px;font:inherit;font-size:11px;color:var(--ui-muted);background:color-mix(in srgb,var(--ui-accent) 6%,var(--ui-bg))}
.diui-diff-skip{cursor:pointer}
.diui-diff-skip:hover{color:var(--ui-accent)}
.diui-tree,.diui-json{font-size:13px;min-width:0}
.diui-tree-title{margin:0 0 6px;font-size:14px}
.diui-tree ul,.diui-json ul{list-style:none;margin:0;padding-left:16px}
.diui-tree>ul,.diui-json>ul{padding-left:0}
.diui-tree-row,.diui-json-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:1px 0}
.diui-tree-toggle{border:0;background:none;color:inherit;font:inherit;padding:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;text-align:left}
.diui-caret{display:inline-block;width:1em;color:var(--ui-muted)}
.diui-tree-file{padding-left:1.25em;overflow-wrap:anywhere}
.diui-tree-count,.diui-tree-note{font-size:11px;color:var(--ui-muted)}
.diui-tree-row[data-status=deleted] .diui-tree-file{text-decoration:line-through;color:var(--ui-muted)}
.diui-json{font-family:var(--dsh-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px}
.diui-json-key{color:var(--ui-accent)}
.diui-json-value{overflow-wrap:anywhere}
.diui-json-value[data-type=string]{color:var(--ui-success)}
.diui-json-value[data-type=number]{color:var(--ui-warning)}
.diui-json-value[data-type=boolean],.diui-json-value[data-type=null]{color:var(--ui-error)}
.diui-json-summary{color:var(--ui-muted)}
.diui-json-close{padding-left:1.25em}
.diui-json-row{position:relative}
.diui-json-tools{display:inline-flex;gap:4px;position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.diui-json-row:hover .diui-json-tools,.diui-json-row:focus-within .diui-json-tools{position:static;width:auto;height:auto;overflow:visible;clip-path:none}
@media (hover:none){.diui-json-tools{position:static;width:auto;height:auto;overflow:visible;clip-path:none}}
.diui-json-copy{border:1px solid var(--ui-border);background:var(--ui-bg);color:var(--ui-muted);border-radius:4px;font:inherit;font-size:10px;padding:0 4px;cursor:pointer;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.diui-datagrid{display:flex;flex-direction:column;gap:8px;min-width:0}
.diui-table-tools{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.diui-table-export{display:inline-flex;flex-wrap:wrap;gap:6px;margin-left:auto}
.diui-chart-block{display:flex;flex-direction:column;gap:6px;min-width:0}
.diui-chart-block>.diui-table-export{margin-left:0}
.diui-input{font:inherit;font-size:13px;color:var(--ui-text);background:var(--ui-bg);border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:5px 8px;min-width:0}
.diui-table-tools input[type=search]{flex:1 1 160px;max-width:280px}
.diui-input:focus-visible,.diui-th-button:focus-visible,.diui-chart-svg:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.diui-filter-row th{font-weight:400;padding:4px 6px;top:auto;position:static}
.diui-filter-row .diui-input{width:100%;min-width:72px;font-size:12px;padding:3px 6px}
.diui-range-filter{display:flex;gap:4px}
.diui-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;font-size:12px;color:var(--ui-muted)}
@media (pointer:coarse){.diui-button,.diui-input,.diui-th-button{min-height:36px}}
.diui-empty{color:var(--ui-muted);text-align:center;padding:12px}
.diui-chart{margin:0;min-width:0}
.diui-chart-title{font-weight:600;font-size:13px;margin-bottom:4px}
.diui-chart-svg{width:100%;height:auto;display:block}
.diui-chart-svg text{fill:var(--ui-muted);font-size:11px}
.diui-chart-svg .diui-axis-label{fill:var(--ui-text);font-size:11px}
.diui-chart-svg .diui-cell-value{fill:var(--ui-text);font-size:10px;pointer-events:none}
.diui-chart-svg .diui-cell-value[data-strong]{fill:#fff}
.diui-colorbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:11px;color:var(--ui-muted);margin-top:4px}
.diui-colorbar>i{display:inline-block;width:120px;height:8px;border-radius:4px;border:1px solid var(--ui-border)}
.diui-colorbar-missing{display:inline-flex;align-items:center;gap:4px;margin-left:8px}
.diui-colorbar-missing b{display:inline-block;width:10px;height:10px;border:1px solid var(--ui-border);background:repeating-linear-gradient(45deg,var(--ui-muted) 0 1.5px,transparent 1.5px 4px);opacity:.7}
.diui-grid line,.diui-chart-svg .diui-grid{stroke:var(--ui-border);stroke-width:1}
.diui-chart-svg .diui-axis-zero{stroke:var(--ui-muted);stroke-width:1}
.diui-slice{stroke:var(--ui-bg);stroke-width:2}
.diui-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:12px;color:var(--ui-muted)}
.diui-legend-item{display:inline-flex;align-items:center;gap:6px;border:0;background:none;color:inherit;font:inherit;padding:0;cursor:pointer}
.diui-legend-item[data-off]{opacity:.4}
.diui-legend-item i{width:10px;height:10px;border-radius:2px;display:inline-block}
.diui-photo,.diui-gallery{margin:0;min-width:0;display:flex;flex-direction:column;gap:6px}
.diui-photo-open{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in;border-radius:var(--ui-radius);overflow:hidden}
.diui-photo-open:focus-visible,.diui-lightbox button:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
.diui-photo-img{display:block;width:100%;max-height:480px;border-radius:var(--ui-radius);background:var(--ui-surface)}
.diui-photo-img[data-status=loading],.diui-gallery-img[data-status=loading]{min-height:120px;animation:diui-pulse 1.4s ease-in-out infinite}
@keyframes diui-pulse{50%{opacity:.6}}
.diui-photo-caption{display:flex;flex-wrap:wrap;gap:2px 10px;font-size:12px;color:var(--ui-muted)}
.diui-photo-credit a{color:inherit}
.diui-photo-fallback{display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:120px;padding:12px;border:1px dashed var(--ui-border);border-radius:var(--ui-radius);background:var(--ui-surface);font-size:13px;overflow-wrap:anywhere}
.diui-photo-fallback-alt{color:var(--ui-text)}
.diui-photo-fallback-why{font-size:12px;color:var(--ui-muted)}
.diui-gallery-grid{list-style:none;margin:0;padding:0;display:grid;gap:8px;grid-template-columns:repeat(var(--diui-cols),minmax(0,1fr))}
@container (max-width:560px){.diui-gallery-grid{grid-template-columns:repeat(min(2,var(--diui-cols)),minmax(0,1fr))}}
.diui-gallery-item{display:flex;flex-direction:column;gap:4px;min-width:0}
.diui-gallery-img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--ui-surface)}
.diui-gallery-item .diui-photo-fallback{aspect-ratio:4/3;min-height:0}
.diui-gallery-caption{font-size:12px;color:var(--ui-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.diui-lightbox{border:0;padding:0;margin:auto;max-width:min(96vw,1200px);max-height:94vh;background:var(--ui-bg);color:var(--ui-text);border-radius:calc(var(--ui-radius) + 4px);box-shadow:0 12px 40px rgba(0,0,0,.35)}
.diui-lightbox::backdrop{background:rgba(0,0,0,.72)}
.diui-lightbox-body{display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px}
.diui-lightbox-bar{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--ui-muted)}
.diui-lightbox-bar a{color:var(--ui-accent)}
.diui-lightbox-close{margin-left:auto;font:inherit;font-size:16px;width:32px;height:32px;border:0;border-radius:50%;background:var(--ui-surface);color:var(--ui-text);cursor:pointer}
.diui-lightbox-stage{position:relative;display:flex;align-items:center;justify-content:center;min-width:min(80vw,320px)}
.diui-lightbox-img{display:block;max-width:100%;max-height:80vh;object-fit:contain;border-radius:var(--ui-radius)}
.diui-lightbox-step{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;border-radius:50%;background:color-mix(in srgb,var(--ui-bg) 85%,transparent);color:var(--ui-text);font-size:24px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.diui-lightbox-step[data-dir=prev]{left:6px}
.diui-lightbox-step[data-dir=next]{right:6px}
.diui-map{margin:0;min-width:0;display:flex;flex-direction:column;gap:6px}
.diui-map-stage{position:relative;overflow:hidden;border:1px solid var(--ui-border);border-radius:var(--ui-radius);background:color-mix(in srgb,var(--ui-accent) 9%,var(--ui-bg));cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.diui-map-stage[data-dragging]{cursor:grabbing}
.diui-map-stage:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.diui-map-base,.diui-map-overlay,.diui-map-tiles{position:absolute;inset:0;display:block}
.diui-map-tile{position:absolute;max-width:none;pointer-events:none}
.diui-map-land{fill:color-mix(in srgb,var(--ui-text) 10%,var(--ui-bg));stroke:color-mix(in srgb,var(--ui-text) 28%,var(--ui-bg));stroke-width:.8;stroke-linejoin:round}
.diui-map-graticule{fill:none;stroke:var(--ui-border);stroke-width:1}
.diui-map-route{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.diui-map-route[data-dashed]{stroke-dasharray:7 6}
.diui-map-route-halo{fill:none;stroke:var(--ui-bg);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;opacity:.8}
.diui-map-marker{cursor:pointer}
.diui-map-marker circle{stroke:#fff;stroke-width:2}
.diui-map-marker[data-selected] circle{stroke:var(--ui-text);stroke-width:2.5}
.diui-map-marker text{font-size:12px;fill:var(--ui-text);paint-order:stroke;stroke:var(--ui-bg);stroke-width:3px;stroke-linejoin:round}
.diui-map-controls{position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:4px}
.diui-map-button{font:inherit;font-size:16px;line-height:1;width:30px;height:30px;border:1px solid var(--ui-border);border-radius:6px;background:var(--ui-bg);color:var(--ui-text);cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.diui-map-button:hover:not(:disabled){border-color:var(--ui-accent);color:var(--ui-accent)}
.diui-map-button:disabled{opacity:.45;cursor:default}
.diui-map-button:focus-visible,.diui-map-item:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.diui-map-attrib,.diui-map-scale{position:absolute;bottom:4px;font-size:10px;line-height:1.4;color:var(--ui-text);background:color-mix(in srgb,var(--ui-bg) 80%,transparent);padding:1px 6px;border-radius:4px;pointer-events:none}
.diui-map-attrib{right:4px;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:auto}
.diui-map-scale{left:4px;display:flex;align-items:center;gap:6px}
.diui-map-scale span{display:inline-block;height:6px;border:1.5px solid var(--ui-text);border-top:0}
.diui-map-hint{margin:0;font-size:12px;color:var(--ui-muted)}
.diui-map-notice{margin:0;font-size:12px;color:var(--ui-warning)}
.diui-map-detail{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:8px 10px;border:1px solid var(--ui-border);border-radius:var(--ui-radius);background:var(--ui-surface)}
.diui-map-detail>div{flex-basis:100%}
.diui-map-coords{font-size:12px;color:var(--ui-muted);font-variant-numeric:tabular-nums}
.diui-map-list{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px;max-height:160px;overflow:auto}
.diui-map-item{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;border:1px solid var(--ui-border);background:var(--ui-bg);color:var(--ui-text);border-radius:999px;padding:3px 10px;cursor:pointer}
.diui-map-item[aria-pressed=true]{border-color:var(--ui-accent);color:var(--ui-accent)}
.diui-map-item i{width:8px;height:8px;border-radius:50%;display:inline-block}
@media (pointer:coarse){.diui-map-button{width:38px;height:38px}.diui-map-item{min-height:32px}}
.diui-tablist{display:flex;gap:2px;border-bottom:1px solid var(--ui-border);margin-bottom:10px;overflow-x:auto}
.diui-tab{border:0;background:none;font:inherit;color:var(--ui-muted);padding:6px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.diui-tab[aria-selected=true]{color:var(--ui-text);border-bottom-color:var(--ui-accent)}
.diui-button{font:inherit;font-size:14px;font-weight:600;border:1px solid var(--ui-border);background:var(--ui-bg);color:var(--ui-text);border-radius:999px;padding:11px 18px;max-width:100%;min-width:0;overflow-wrap:anywhere;cursor:pointer}
.diui-button:hover:not(:disabled){border-color:var(--ui-text);background:var(--ui-surface)}
.diui-button[data-variant=primary],.diui-choice-submit{background:var(--ui-text);border-color:var(--ui-text);color:var(--ui-bg)}
.diui-button[data-variant=primary]:hover:not(:disabled),.diui-choice-submit:hover:not(:disabled){background:var(--ui-text);border-color:var(--ui-text);filter:brightness(.92)}
.diui-button:disabled{opacity:.55;cursor:default}
.diui-button:focus-visible,.diui-tab:focus-visible,.diui-field input:focus-visible,.diui-field select:focus-visible,.diui-field textarea:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.diui-action{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:100%;min-width:0}
.diui-note{font-size:12px;color:var(--ui-muted)}
.diui-choice-recommended{font-size:11px;font-weight:500;color:var(--ui-accent);border:1px solid var(--ui-border);border-radius:999px;padding:1px 7px}
.diui-choice-hint{font-size:12px;line-height:1.6;color:var(--ui-muted);overflow-wrap:anywhere}
.diui-choice-option input:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
.diui-choice fieldset{border:0;margin:0;padding:0;min-width:0}
.diui-form{display:flex;flex-direction:column;gap:10px}
.diui-choice{border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:10px}
.diui-choice-question{padding:0;font-weight:600;font-size:15px;margin-bottom:2px}
.diui-choice-options{display:flex;flex-direction:column;gap:6px}
.diui-choice-option{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--ui-border);border-radius:var(--ui-radius);cursor:pointer;transition:border-color .15s,background .15s}
.diui-choice-option:hover{border-color:var(--ui-accent)}
.diui-choice-option[data-selected]{border-color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 8%,var(--ui-bg))}
.diui-choice fieldset:disabled .diui-choice-option{cursor:default}
.diui-choice fieldset:disabled .diui-choice-option:not([data-selected]){opacity:.55}
.diui-choice-option input{margin:3px 0 0;accent-color:var(--ui-accent);flex:none}
.diui-choice-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.diui-choice-desc{font-size:12px;color:var(--ui-muted)}
.diui-choice-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.diui-form-title{margin:0;font-size:15px}
.diui-field{display:flex;flex-direction:column;gap:4px;font-size:13px}
.diui-field[data-type=checkbox]{flex-direction:row-reverse;justify-content:flex-end;align-items:center;gap:8px}
.diui-field-label{color:var(--ui-muted)}
.diui-required{color:var(--ui-error)}
.diui-field input:not([type=checkbox]),.diui-field select,.diui-field textarea{font:inherit;color:var(--ui-text);background:var(--ui-bg);border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:6px 8px;width:100%;box-sizing:border-box}
.diui-form-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.diui-form-actions>button[type=submit]{width:100%;flex:0 0 100%}
.diui-tail{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.diui-compose{display:flex;flex-direction:column;gap:12px;padding:2px 14px 14px}
.diui-compose>.diui-render{padding:0}
.diui-compose-widget-head{font-weight:600;font-size:13px;margin-bottom:6px}
.diui-compose-pointer{font-size:12px;color:var(--ui-muted);border:1px dashed var(--ui-border);border-radius:var(--ui-radius);padding:6px 10px}
.diui-md{font-size:14px;line-height:1.65;overflow-wrap:anywhere}
.diui-md>:first-child{margin-top:0}
.diui-md>:last-child{margin-bottom:0}
.diui-md h1,.diui-md h2,.diui-md h3,.diui-md h4{line-height:1.3;margin:1.1em 0 .45em}
.diui-md h1{font-size:1.45em}
.diui-md h2{font-size:1.25em}
.diui-md h3{font-size:1.1em}
.diui-md h4{font-size:1em}
.diui-md p,.diui-md ul,.diui-md ol,.diui-md blockquote,.diui-md table,.diui-md pre{margin:.6em 0}
.diui-md ul,.diui-md ol{padding-left:1.4em}
.diui-md li+li{margin-top:.2em}
.diui-md blockquote{margin-left:0;padding:2px 12px;border-left:3px solid var(--ui-border);color:var(--ui-muted)}
.diui-md code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:.92em;background:var(--ui-surface);padding:1px 4px;border-radius:4px}
.diui-md pre{padding:10px;border-radius:var(--ui-radius);background:var(--ui-surface);border:1px solid var(--ui-border);overflow:auto}
.diui-md pre code{background:none;padding:0;font-size:12.5px}
.diui-md table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow:auto}
.diui-md th,.diui-md td{padding:5px 9px;border:1px solid var(--ui-border);text-align:left;vertical-align:top}
.diui-md th{background:var(--ui-surface);font-weight:600}
.diui-md a{color:var(--ui-accent)}
.diui-md hr{border:0;border-top:1px solid var(--ui-border);margin:1em 0}
.diui-md img{max-width:100%}
@media (max-width:560px){.diui-compose{padding:2px 10px 10px}}
.diui-node-error{font-size:12px;color:var(--ui-error);border:1px dashed var(--ui-error);border-radius:var(--ui-radius);padding:6px 8px}
.diui-sort{margin-left:4px;opacity:.45;font-size:11px}
th[aria-sort] .diui-sort{opacity:1;color:var(--ui-accent)}
.diui-plot,.diui-chart{position:relative}
.diui-plot{margin:0;min-width:0}
.diui-plot-stage{position:relative}
.diui-chart-svg{touch-action:pan-y}
.diui-chart-svg .diui-hover-band{fill:var(--ui-text);opacity:.05}
.diui-chart-svg .diui-crosshair{stroke:var(--ui-muted);stroke-dasharray:3 3;stroke-width:1}
.diui-hover-dot{stroke:var(--ui-bg);stroke-width:2}
.diui-tooltip{position:absolute;top:6px;transform:translateX(-50%);pointer-events:none;background:var(--ui-bg);border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:4px 8px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.12);white-space:nowrap;z-index:2;font-variant-numeric:tabular-nums}
.diui-tooltip i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}
.diui-tooltip-head{font-weight:600;margin-bottom:2px}
.diui-legend-item[data-error]{color:var(--ui-error);text-decoration:underline dotted}
.diui-params{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px 18px;margin-top:10px;align-items:center}
.diui-param,.diui-range{display:flex;align-items:center;gap:10px;font-size:13px;min-width:0}
.diui-param-name{color:var(--ui-muted);min-width:2ch;white-space:nowrap}
.diui-param input,.diui-range input{flex:1;min-width:80px;accent-color:var(--ui-accent)}
.diui-param-value,.diui-range output{font-variant-numeric:tabular-nums;min-width:4ch;text-align:right;color:var(--ui-text)}
.diui-param-reset{justify-self:start;font-size:12px}
.diui-timeline{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.diui-timeline-item{position:relative;display:flex;gap:12px;padding-bottom:14px}
.diui-timeline-item:last-child{padding-bottom:0}
.diui-timeline-item::before{content:"";position:absolute;left:5px;top:16px;bottom:0;width:2px;background:var(--ui-border)}
.diui-timeline-item:last-child::before{display:none}
.diui-timeline-dot{flex:none;width:12px;height:12px;margin-top:4px;border-radius:50%;background:var(--ui-bg);border:2px solid var(--ui-accent)}
.diui-timeline-item[data-tone=success] .diui-timeline-dot{border-color:var(--ui-success)}
.diui-timeline-item[data-tone=warning] .diui-timeline-dot{border-color:var(--ui-warning)}
.diui-timeline-item[data-tone=error] .diui-timeline-dot{border-color:var(--ui-error)}
.diui-timeline-item[data-tone=muted] .diui-timeline-dot{border-color:var(--ui-border)}
.diui-timeline-time{font-size:12px;color:var(--ui-muted)}
.diui-timeline-title{font-weight:600}
.diui-timeline-text{color:var(--ui-muted);font-size:13px}
.diui-lib{min-width:0}
.diui-button[aria-busy=true]{cursor:progress}
@media (prefers-reduced-motion:reduce){.diui-dots i,.diui-skeleton,.diui-shimmer,.diui-photo-img,.diui-gallery-img{animation:none}.diui-frame,.diui-progress-bar{transition:none}}
`
