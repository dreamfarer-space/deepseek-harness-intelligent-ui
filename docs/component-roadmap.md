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

## Proposed: `Calendar` (schedule snapshot)

Not implemented yet. A read-only agenda for "plan my week" style answers;
`Timeline` narrates events, it does not lay them out by duration.

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

## Considered and left for separate issues

- **Quiz / multi-select ChoiceGroup**: `Choice` covers single-choice
  clarification with explicit submit; scoring, multi-select and retries need
  their own state semantics (what a patch does to an answered quiz).
- **Accordion, KeyValue, Steps, Audio, Scene3D**: lower frequency;
  most are compositions of existing components or are better served by a
  widget. (`Image`/`Gallery` shipped with the `mediaAllowedOrigins` policy.)
- **More chart types** (histogram, box plot, radar, Sankey): add on evidence of
  real demand, preferably as a trusted catalog extension
  (`docs/component-extensions.md`) rather than growing the core catalog.
