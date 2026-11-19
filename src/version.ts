// Single source of the plugin version: package.json. public/manifest.json must
// match it (checked by test_version_consistency.cjs before every release).
import pkg from '../package.json';

export const PLUGIN_VERSION: string = pkg.version;
