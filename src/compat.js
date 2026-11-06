/**
 * Which DeepSeek Harness runtimes this plugin supports.
 *
 * Single source for the installer CLI, the docs and the tests;
 * `tests/compat.test.js` keeps `package.json` peerDependencies in sync.
 * DSH checks those peers at install time (`evaluatePluginCompatibility`,
 * prereleases included), so a range that is too narrow refuses the install.
 * @module deepseek-harness-intelligent-ui/compat
 */

import semver from 'semver';

/** Range of `@deepseek-ai/dsh` / `@deepseek-ai/dsh-llm` versions the plugin runs on. */
export const SUPPORTED_DSH_RANGE = '>=0.1.7-rc.1 <0.3.0-0 || >=0.2.0-0 <0.2.0 || >=0.2.1-0 <0.2.1 || >=0.2.2-0 <0.2.2 || >=0.2.3-0 <0.2.3 || >=0.2.4-0 <0.2.4';

/** Range of `@deepseek-ai/cordis` versions the plugin runs on (including 4.1.x in DSH 0.2.2+). */
export const SUPPORTED_CORDIS_RANGE = '~4.0.4 || >=4.0.5-alpha.0 <5.0.0-0 || >=4.0.6-0 <4.0.6 || >=4.1.0-0 <4.1.0 || >=4.2.0-0 <4.2.0';

/** Versions the CI compatibility matrix installs the packed plugin into. */
export const TESTED_DSH_VERSIONS = Object.freeze(['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.2', '0.2.1-alpha.4', '0.2.1-alpha.5', '0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4', '0.2.1-rc.5', '0.2.2-alpha.2', '0.2.2-alpha.3', '0.2.2-rc.1']);

/** Lowest Node.js version the plugin and DSH 0.1.7–0.2.1 require. */
export const MIN_NODE_VERSION = '22.13.0';

/** Lowest Node.js version DSH 0.2.2+ declares in its package engines. */
export const MIN_NODE_VERSION_DSH_0_2_2 = '24.9.0';

/**
 * Return the minimum Node.js version required for the detected DSH version.
 * DSH 0.2.2+ raised its `engines.node` requirement to `>=24.9.0`, while older
 * DSH releases and this plugin itself run on Node.js `>=22.13.0`.
 * @param {string | null | undefined} dshVersion
 * @returns {string}
 */
export function minNodeVersionForDsh(dshVersion) {
  if (typeof dshVersion === 'string' && semver.valid(dshVersion) && semver.gte(dshVersion, '0.2.2-0', { includePrerelease: true })) {
    return MIN_NODE_VERSION_DSH_0_2_2;
  }
  return MIN_NODE_VERSION;
}
