/**
 * Host-side styles for the tool cards and catalog components. Injected once
 * as a <style> element by the client plugin (removed on unload). All colors
 * come from the host's design tokens with sane fallbacks.
 */
export const STYLES = `
.diui{
  --ui-bg:var(--dsw-alias-bg-base,#fff);
  --ui-surface:var(--dsw-alias-bg-l1,var(--dsw-alias-bg-layer-1,#f6f7f9));
  --ui-text:var(--dsw-alias-label-primary,#1f2329);
  --ui-muted:var(--dsw-alias-label-tertiary,#6b7280);
  --ui-border:var(--dsw-alias-border-l2,#e3e5e8);
  --ui-accent:var(--dsw-alias-brand-primary,#4d6bfe);
  --ui-accent-text:var(--dsw-alias-label-primary-inverted,#fff);
  --ui-success:var(--dsw-alias-state-success-primary,#16a34a);
  --ui-warning:var(--dsw-alias-state-warn-primary,#d97706);
  --ui-error:var(--dsw-alias-state-error-primary,#dc2626);
  --ui-radius:var(--dsw-radius-sm,8px);
  color:var(--ui-text);
  font-size:var(--dsh-content-font-size,14px);
  line-height:1.5;
}
.diui-shell{border:1px solid var(--ui-border);border-radius:calc(var(--ui-radius) + 4px);overflow:hidden;margin:6px 0;background:var(--ui-bg);max-width:100%}
.diui-shell-head{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--ui-border);color:var(--ui-muted);font-size:12px;min-height:30px}
.diui-shell-icon{color:var(--ui-accent)}
.diui-shell-title{font-weight:600;color:var(--ui-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.diui-shell-status{margin-left:auto;white-space:nowrap}
.diui-shell[data-state=error] .diui-shell-icon{color:var(--ui-error)}
.diui-shell-body{position:relative}
.diui-dots{display:inline-flex;gap:3px}
.diui-dots i{width:4px;height:4px;border-radius:50%;background:var(--ui-accent);animation:diui-blink 1.2s infinite ease-in-out}
.diui-dots i:nth-child(2){animation-delay:.2s}.diui-dots i:nth-child(3){animation-delay:.4s}
@keyframes diui-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
.diui-frame{display:block;width:100%;border:0;background:transparent;transition:height .15s ease}
.diui-placeholder{padding:16px;display:flex;flex-direction:column;gap:10px}
.diui-skeleton,.diui-shimmer{height:56px;border-radius:var(--ui-radius);background:linear-gradient(90deg,var(--ui-surface) 25%,var(--ui-border) 50%,var(--ui-surface) 75%);background-size:200% 100%;animation:diui-shimmer 1.4s infinite linear}
.diui-shimmer{height:28px}
@keyframes diui-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.diui-placeholder-text{color:var(--ui-muted);font-size:13px}
.diui-problem{padding:10px 12px;color:var(--ui-muted);display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.diui-problem-detail{flex-basis:100%;margin:0;white-space:pre-wrap;font-size:12px;max-height:240px;overflow:auto;background:var(--ui-surface);padding:8px;border-radius:var(--ui-radius)}
.diui-link{border:0;background:none;color:var(--ui-accent);cursor:pointer;padding:0;font:inherit}
.diui-render{padding:12px;display:flex;flex-direction:column;gap:10px}
.diui-stack{display:flex;flex-direction:column;min-width:0}
.diui-stack[data-direction=horizontal]{flex-direction:row}
.diui-stack[data-direction=horizontal]>*{flex:1 1 0;min-width:0}
.diui-grid{display:grid;gap:10px;grid-template-columns:repeat(var(--diui-cols),minmax(0,1fr))}
@container (max-width:520px){.diui-grid{grid-template-columns:repeat(min(2,var(--diui-cols)),minmax(0,1fr))}}
@media (max-width:640px){.diui-grid{grid-template-columns:repeat(min(2,var(--diui-cols)),minmax(0,1fr))}.diui-stack[data-direction=horizontal]{flex-wrap:wrap}}
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
.diui-empty{color:var(--ui-muted);text-align:center;padding:12px}
.diui-chart{margin:0;min-width:0}
.diui-chart-title{font-weight:600;font-size:13px;margin-bottom:4px}
.diui-chart-svg{width:100%;height:auto;display:block}
.diui-chart-svg text{fill:var(--ui-muted);font-size:11px}
.diui-grid line,.diui-chart-svg .diui-grid{stroke:var(--ui-border);stroke-width:1}
.diui-chart-svg .diui-axis-zero{stroke:var(--ui-muted);stroke-width:1}
.diui-slice{stroke:var(--ui-bg);stroke-width:2}
.diui-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:12px;color:var(--ui-muted)}
.diui-legend-item{display:inline-flex;align-items:center;gap:6px;border:0;background:none;color:inherit;font:inherit;padding:0;cursor:pointer}
.diui-legend-item[data-off]{opacity:.4}
.diui-legend-item i{width:10px;height:10px;border-radius:2px;display:inline-block}
.diui-tablist{display:flex;gap:2px;border-bottom:1px solid var(--ui-border);margin-bottom:10px;overflow-x:auto}
.diui-tab{border:0;background:none;font:inherit;color:var(--ui-muted);padding:6px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.diui-tab[aria-selected=true]{color:var(--ui-text);border-bottom-color:var(--ui-accent)}
.diui-button{font:inherit;font-size:13px;border:1px solid var(--ui-border);background:var(--ui-bg);color:var(--ui-text);border-radius:var(--ui-radius);padding:6px 14px;cursor:pointer}
.diui-button:hover:not(:disabled){border-color:var(--ui-accent)}
.diui-button[data-variant=primary]{background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-accent-text)}
.diui-button:disabled{opacity:.55;cursor:default}
.diui-button:focus-visible,.diui-tab:focus-visible,.diui-field input:focus-visible,.diui-field select:focus-visible,.diui-field textarea:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.diui-action{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.diui-note{font-size:12px;color:var(--ui-muted)}
.diui-form{display:flex;flex-direction:column;gap:10px}
.diui-form-title{margin:0;font-size:15px}
.diui-field{display:flex;flex-direction:column;gap:4px;font-size:13px}
.diui-field[data-type=checkbox]{flex-direction:row-reverse;justify-content:flex-end;align-items:center;gap:8px}
.diui-field-label{color:var(--ui-muted)}
.diui-required{color:var(--ui-error)}
.diui-field input:not([type=checkbox]),.diui-field select,.diui-field textarea{font:inherit;color:var(--ui-text);background:var(--ui-bg);border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:6px 8px;width:100%;box-sizing:border-box}
.diui-form-actions{display:flex;align-items:center;gap:10px}
.diui-tail{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.diui-node-error{font-size:12px;color:var(--ui-error);border:1px dashed var(--ui-error);border-radius:var(--ui-radius);padding:6px 8px}
`
