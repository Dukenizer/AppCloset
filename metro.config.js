const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './wa-sqlite/wa-sqlite.wasm') {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'assets', 'wa-sqlite.wasm'),
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
