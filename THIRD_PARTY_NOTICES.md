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

## idiomorph — 0BSD License

https://github.com/bigskysoftware/idiomorph (v0.7.4). Its minified build is embedded in `client/client.js` and injected into widget preview frames.

Copyright (c) Big Sky Software. Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.

## React — MIT License

React is provided at runtime by the DSH Web shell. It is not bundled.
