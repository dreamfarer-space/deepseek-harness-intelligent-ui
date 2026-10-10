/**
 * Which DeepSeek Harness runtimes this plugin supports.
 *
 * Single source for the installer CLI, the docs and the tests;
 * `tests/compat.test.js` keeps `package.json` peerDependencies in sync.
 * DSH checks those peers at install time (`evaluatePluginCompatibility`,
 * prereleases included), so a range that is too narrow refuses the install.
 * @module deepseek-harness-intelligent-ui/compat
 */

/** Range of `@deepseek-ai/dsh` / `@deepseek-ai/dsh-llm` versions the plugin runs on. */
export const SUPPORTED_DSH_RANGE = '>=0.1.7-rc.1 <0.3.0-0';

/** Versions the CI compatibility matrix installs the packed plugin into. */
export const TESTED_DSH_VERSIONS = Object.freeze(['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.2']);

/** Lowest Node.js version DSH itself requires. */
export const MIN_NODE_VERSION = '22.13.0';
