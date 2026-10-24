export type { PluginAPI, PluginJev } from '@wrongstack/contracts/types/plugin';
export { DefaultPluginAPI, definePlugin, type PluginAPIInit } from './api.js';
export {
  diffPluginConfig,
  type PluginConfigChange,
  type PluginConfigSource,
  type PluginEnablementSource,
  pluginEntryMatchesName,
  type ResolvedPluginConfig,
  type ResolvedPluginEnablement,
  type ResolvePluginConfigInput,
  type ResolvePluginEnablementInput,
  redactPluginConfig,
  resolvePluginConfig,
  resolvePluginEnablement,
  resolvePluginManifestConfig,
  validatePluginConfigMetadata,
} from './config.js';
export {
  DEFAULT_PLUGIN_DISCOVERY_IO,
  type DiscoveryIo,
  discoverExternalPlugins,
  type ExternalPluginCandidate,
  type PluginDiscoveryResult,
  resolvePluginEntryPath,
  resolvePluginTarget,
  type SkippedPluginCandidate,
} from './discovery.js';
export {
  KERNEL_API_VERSION,
  type LoadPluginsOptions,
  loadPlugins,
  type PluginHostHandle,
  type PluginLoadFailure,
  unloadPlugins,
} from './loader.js';
export {
  defaultPluginTrustPath,
  hashFileContents,
  normalizeTrustKey,
  type PluginTrustEntry,
  type PluginTrustStore,
  type PluginTrustVerification,
  pinPluginTrust,
  readPluginTrustStore,
  unpinPluginTrust,
  verifyPluginTrust,
  writePluginTrustStore,
} from './trust.js';
