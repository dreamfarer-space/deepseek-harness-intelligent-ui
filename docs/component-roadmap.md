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

## Proposed: `Map` (geo view)

Not implemented yet. A declarative contract that separates **data** from the
**base map**, so the data part works offline and in the portable renderer.

```jsonc
{
  "type": "Map",
  "props": {
    "title": "Kyoto day trip",
    "markers": [{ "id": "a", "lat": 34.9671, "lon": 135.7727, "label": "Fushimi Inari", "group": "Morning" }],
    "routes": [{ "id": "r1", "points": [[34.9671, 135.7727], [34.9949, 135.7850]], "label": "Train" }],
    "geojson": null,               // optional FeatureCollection, size-limited
    "fit": "data",                 // or { "lat", "lon", "zoom" }
    "basemap": "none"              // "none" | "tiles" (host-approved provider only)
  }
}
```

- **Coordinates** are WGS84 `lat`/`lon` in degrees, validated to ±90/±180;
  `[lat, lon]` order everywhere (stated in the schema description because models
  often swap it).
- **Default `basemap: "none"`**: an SVG equirectangular/Web-Mercator projection
  of markers, routes and GeoJSON outlines, with axes in degrees. Works offline,
  needs no network, no third-party script and no attribution.
- **`basemap: "tiles"`** only when the Host configures a tile provider (URL
  template, attribution, max zoom) through plugin config, like the CDN
  allowlist. The tile layer is loaded inside the existing sandboxed frame so
  network policy and CSP stay in one place; attribution is always shown.
- **Interaction**: marker list ↔ map selection, keyboard stepping through
  markers, pan/zoom with buttons as well as gestures, details panel.
- **Limits**: 500 markers, 50 routes × 1,000 points, GeoJSON ≤ 200 KB.
- **Out of scope**: geocoding addresses (the model must supply coordinates),
  live location, routing services.

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
- **Accordion, KeyValue, Steps, Image/Audio/Video, Scene3D**: lower frequency;
  most are compositions of existing components or are better served by a
  widget. Media needs a Host URL policy first.
- **More chart types** (histogram, box plot, radar, Sankey): add on evidence of
  real demand, preferably as a trusted catalog extension
  (`docs/component-extensions.md`) rather than growing the core catalog.
