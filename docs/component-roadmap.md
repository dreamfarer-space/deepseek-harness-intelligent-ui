# Component roadmap (#17)

Status of [#17](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/17)
"advanced data visualisation and tool components". The aim is to turn frequent
tasks that otherwise make the model write fragile widget JavaScript into
declarative, validated, testable catalog components.

## Shipped

| Component | What it covers | Limits |
|---|---|---|
| `Table` (data grid) | Typed sort (numbers, ISO 8601 dates, booleans; empty values last), `columnTypes`, `searchable`, `filterable` (per-column contains / min–max, AND), `pageSize`, `exportable` CSV/Markdown of the filtered, sorted rows | 500 rows × 24 columns |
| `Chart` | Keyboard focus (arrows, Home/End, Escape), tap to inspect, `exportable`, laid out at the card's real width so axis text stays legible on phones | 500 points, 12 series |
| `Scatter` | Continuous x/y observations, units, nearest-point hover, tap, arrow keys, legend toggles; points missing a coordinate are hidden and counted | 2,000 points |
| `Heatmap` | Category × category matrix, sequential or zero-centred diverging scale, fixed `min`/`max`, colour bar; `null` cells are hatched "no data", never 0 | 60 × 60 cells |
| `CodeDiff` | Multi-file diff from before/after text (computed in the browser) or a unified `patch`; line numbers, ± counts, expandable context, large files collapsed | 20 files, 200,000 characters |
| `FileTree` | Slash paths with status badges and notes; keyboard expand/collapse | 2,000 entries |
| `JsonView` | Collapsible JSON tree with `$.a[0].b` paths, copy path / copy value | 100,000 characters, depth 32 |
| `Choice` | Single-choice card that continues here or in a new session ([#39](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/pull/39)) | 8 options |

Common rules for all of them:

- **Local first.** Sorting, filtering, paging, export, hover and expansion run in
  the browser and never call the model. Interaction state survives remounts,
  patches and reloads.
- **Text, not HTML.** Code, JSON, cell values and labels render as React text.
  CSV export neutralises spreadsheet formula injection (`=`, `+`, `-`, `@`, TAB,
  CR) and is RFC 4180 with a UTF-8 BOM; Markdown export escapes table syntax.
- **No host access.** Paths in `CodeDiff`/`FileTree` are labels; nothing is read
  from disk.
- **Validated limits.** Sizes, shapes (`values` vs labels), finite numbers and
  nesting depth are checked by the Host before the UI is accepted, so the model
  gets `ok:false` with paths and retries.
- **Accessible.** Charts are focusable with keyboard inspection, tables use
  `scope`/`aria-sort`, trees use `role=tree`/`treeitem`/`aria-expanded`, touch
  targets grow on coarse pointers, and everything works in the dark theme and at
  360 px width.

Coverage: unit and interaction tests (`tests/datagrid`, `scatter`, `codeview`)
and the mock-model browser E2E checks 13a–13g (search + range/date filters,
CSV contents and formula neutralisation, scatter hover, heatmap keyboard with
0 vs missing data, CodeDiff without HTML execution, no model calls).

## Shipped: `Map` (geo view)

```jsonc
{
  "type": "Map",
  "props": {
    "title": "Kyoto day trip",
    "markers": [{ "id": "a", "lat": 34.9671, "lon": 135.7727, "label": "Fushimi Inari", "group": "Morning", "note": "Go early" }],
    "routes": [{ "label": "Itinerary sketch", "dashed": true, "points": [[34.9671, 135.7727], [34.9949, 135.7850]] }],
    "center": { "lat": 35, "lon": 135.75 }, "zoom": 12,   // optional; default fits the data
    "basemap": "auto"                                      // "auto" | "outline"
  }
}
```

- **Coordinates** are WGS84 degrees: markers use `lat`/`lon`, route points are
  `[lat, lon]`. The Host rejects values outside ±90/±180 and says so when the
  order looks swapped.
- **Base map.** By default an offline world outline (Natural Earth 1:110m land,
  ~21 KB in the bundle) with a 30° graticule: no network, no third-party script.
  When the Host sets `mapTileUrl` (https template with `{z}`/`{x}`/`{y}`),
  `mapTileAttribution` and `mapTileMaxZoom`, raster tiles are drawn as plain
  images under the overlay with the attribution always visible; after four tile
  failures without a single success the map falls back to the outline and says
  so. `basemap: "outline"` never requests tiles.
- **Interaction**: drag, arrow keys, `+`/`−`, double-click and Ctrl/⌘+wheel
  (plain wheel scrolls the page), a fit-to-data button, a scale bar, group
  legend toggles, and a place list ↔ marker selection with a details panel. View
  and selection persist like other component state.
- **Routes** are straight segments between the given points, drawn the short
  way across the antimeridian. They are not road directions; the guidance tells
  the model to label them and use `dashed`.
- **Limits**: 500 markers, 50 routes, 1,000 points per route and 5,000 in total.
- **Out of scope**: geocoding addresses (the model must supply coordinates),
  live location, routing services, GeoJSON overlays.

## Shipped: `Calendar` (schedule snapshot) & Issue #93 Catalog Expansion

```jsonc
{
  "type": "Calendar",
  "props": {
    "view": "week",                // "day" | "week" | "agenda"
    "timeZone": "Asia/Shanghai",   // required: times are never guessed
    "start": "2026-10-19",
    "events": [{ "id": "e1", "title": "Design review", "start": "2026-10-20T10:00", "end": "2026-10-20T11:30", "group": "Work", "note": "Room 3" }]
  }
}
```

- Events are positioned by real duration; overlaps split into columns.
- ISO 8601 local times interpreted in `timeZone`; all-day events have date-only
  `start`/`end`.
- Click, tap or keyboard opens details; narrow screens fall back to the agenda
  view.
- Read-only: no booking, no calendar write access. A "send to agent" action can
  reuse `Button`/`Choice`.
- Limits: 300 events, 31 days.

### Shipped in Issue #93 (Packages 1–4)

| Component / Upgrade | What it covers | Limits |
|---|---|---|
| `Accordion` | Collapsible sections with inline `text` or child panels, `multiple` toggle, badge/tone, keyboard header navigation, persisted expand state | 24 items |
| `Steps` | Step-by-step progress tracker with explicit `status` (`done` \| `active` \| `pending` \| `error`) or zero-based `current` index | 24 steps |
| `KeyValue` | 1–3 column key/value specification grid with `hint`, `tone`, `$computed` values and one-click `copyable` fields | 100 items |
| `EmptyState` | Standardized empty/uninitialized callout with optional `actionLabel` + `prompt`/`action` | 1 action |
| `FollowUp` | Lightweight closing follow-up suggestion chips that send `prompt` on click | 6 items |
| `Sources` | Structured citation list of validated `https://` links or plain-text literature/document labels | 20 sources |
| `Segmented` | Local segmented control bound via `bindKey` to drive `computed` formulas, `Chart` series and `Table.filterValue` | 12 options |
| `Choice` (multi-select & chips) | `multiple`, `minSelect`/`maxSelect`, `variant: "cards" \| "chips"`, preserving valid selections across `ui_patch` | 8 options |
| `Form.fields` upgrades | `switch`, `tags` (with `maxTags`, paste/comma splitting and duplicate guard), `daterange` (`{start, end}`), and `select` local search filter | 40 fields, 50 tags |
| `Chart` (`hbar`, `radar`) | Horizontal bar chart (`hbar`, grouped/stacked) for long category labels and multi-axis `radar` chart | 500 points, 12 series |
| `Audio` | HTTPS audio playback governed by `mediaAllowedOrigins` and offline policy with fallback card | 1 stream |
