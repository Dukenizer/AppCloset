/**
 * Dynamic Expo config. Base values come from app.json via Expo's `config` argument.
 * Secrets from env / EAS / optional gitignored .env.
 */
const path = require('path');
const fs = require('fs');

function googleIosUrlScheme(clientId) {
  const trimmed = (clientId || '').trim();
  if (!/\.apps\.googleusercontent\.com$/i.test(trimmed)) return '';
  const prefix = trimmed.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${prefix}`;
}

try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2] ?? '';
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
} catch {
  // ignore
}

module.exports = ({ config }) => {
  const googleClientId = process.env.GOOGLE_ANDROID_CLIENT_ID ?? '';
  const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID ?? '';
  const iosUrlScheme = googleIosUrlScheme(googleIosClientId || googleClientId);
  const googleSignInPlugin = iosUrlScheme
    ? [['@react-native-google-signin/google-signin', { iosUrlScheme }]]
    : [];

  const basePlugins = config.plugins ?? [];
  const hasExpoSharing = basePlugins.some(
    (p) => p === 'expo-sharing' || (Array.isArray(p) && p[0] === 'expo-sharing'),
  );

  return {
    ...config,
    plugins: [...(hasExpoSharing ? basePlugins : ['expo-sharing', ...basePlugins]), ...googleSignInPlugin],
    extra: {
      ...config.extra,
      vipSalt: process.env.ARTCLOSET_VIP_SALT ?? '',
      googleAndroidClientId: googleClientId,
      googleIosClientId: googleIosClientId,
    },
    updates: {
      url: `https://u.expo.dev/${config.extra?.eas?.projectId ?? ''}`,
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
  };
};
