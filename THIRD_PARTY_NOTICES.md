# Third-party notices

## CopilotKit/OpenIntelligentUI — MIT License

https://github.com/CopilotKit/OpenIntelligentUI

This plugin adapts the following from OpenIntelligentUI. It contains no verbatim source files; the code was rewritten for DeepSeek Harness.

- **Widget streaming contract:** the field order `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions`.
- **Frame layout:** CSP, then importmap, then design CSS, then widget CSS, then body.
- **Partial-HTML sanitization approach.**
- **`sendPrompt` bridge semantics.**
- **Guidance wording:** parts of the agent prompt guidance (`apps/agent/src/prompt.py`).

Copyright (c) CopilotKit. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the condition that the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## react-markdown and remark-gfm — MIT License

https://github.com/remarkjs/react-markdown (10.1.0) and https://github.com/remarkjs/remark-gfm (4.0.1) are bundled into `client/client.js` and `renderer/renderer.js` to render the prose blocks of composed answers. Raw HTML is never rendered and links are restricted to http(s)/mailto.

Copyright (c) 2015 Espen Hovlandsdal. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## idiomorph — 0BSD License

https://github.com/bigskysoftware/idiomorph (v0.7.4). Its minified build is embedded in `client/client.js` and injected into widget preview frames.

Copyright (c) Big Sky Software. Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.

## world-atlas — ISC License; Natural Earth — public domain

https://github.com/topojson/world-atlas (2.0.2). `scripts/map/build-land.mjs` converts its `land-110m.json` (derived from [Natural Earth](https://www.naturalearthdata.com/) 1:110m land, public domain) into the rounded outline in `client-src/catalog/map-land.ts`, bundled into `client/client.js` and `renderer/renderer.js` as the `Map` component's offline base map.

Copyright 2013-2019 Michael Bostock. Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.

## React — MIT License

React is provided at runtime by the DSH Web shell. It is not bundled.

## dsh-whale-musume whale-girl illustrations (demo video only) — MIT License

https://github.com/Sutera-Diffusus/dsh-whale-musume

26 unmodified illustrations in `scripts/eval/demo/assets/whale/` narrate the demo video and GIF in `docs/assets/real-model/`. They are not included in the npm package. The full licence text is in `scripts/eval/demo/assets/whale/LICENSE`.

Copyright (c) 2026 Sutera-Diffusus. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the condition that the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Optional offline resource tarball

The default online package does not embed the CDN libraries. The opt-in offline
tarball includes KaTeX (0.16.11, MIT), Mermaid (11.4.1, MIT), Three.js (0.169.0,
MIT), D3 (7.9.0, ISC), Chart.js (4.4.4, MIT), canvas-confetti (1.9.3, ISC), and
locked transitive dependencies. Their complete upstream licenses, notices and
package declarations ship under `offline-resources/licenses/`; the inventory,
versions, integrity and file checksums are in `offline-resources/manifest.json`.
GSAP is not embedded in the optional pack. See `docs/offline-resources.md` in the
source repository for build and refresh instructions.
