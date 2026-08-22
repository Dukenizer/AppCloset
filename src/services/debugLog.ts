import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { SUPPORT_EMAIL } from '@/legal/privacy';

const ENABLED_FILE = 'enabled.json';
const LOG_FILE = 'artcloset-debug.jsonl';
const MAX_LOG_BYTES = 400_000;
const SECRET_KEY = /token|authorization|password|secret|id_token|accessToken|refreshToken|bearer|cookie/i;

let enabledCache: boolean | null = null;
let writeChain: Promise<void> = Promise.resolve();
let crashHookInstalled = false;

function diagnosticsDir(): string | null {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return null;
  return `${FileSystem.documentDirectory}artcloset/diagnostics/`;
}

export function logFileUri(): string | null {
  const dir = diagnosticsDir();
  return dir ? `${dir}${LOG_FILE}` : null;
}

export function redactValue(input: unknown): unknown {
  if (typeof input === 'string') {
    return input
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/ya29\.[A-Za-z0-9_\-.]+/g, '[redacted-token]');
  }
  if (Array.isArray(input)) return input.map(redactValue);
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactValue(value);
    }
    return out;
  }
  return input;
}

export function isDiagnosticsEnabled(): boolean {
  return enabledCache === true;
}

async function ensureDir(): Promise<string | null> {
  const dir = diagnosticsDir();
  if (!dir) return null;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function loadDiagnosticsEnabled(): Promise<boolean> {
  const dir = diagnosticsDir();
  if (!dir) {
    enabledCache = false;
    return false;
  }
  try {
    const raw = await FileSystem.readAsStringAsync(`${dir}${ENABLED_FILE}`);
    const parsed = JSON.parse(raw) as { enabled?: boolean };
    enabledCache = parsed.enabled === true;
  } catch {
    // Production-safe default: if we can't read the toggle file, keep diagnostics OFF.
    // Backup/restore explicitly turns logging on via activateBackupRestoreLogging().
    enabledCache = false;
  }
  if (enabledCache) installCrashHook();
  return enabledCache;
}

/** Load toggle + install crash hook so a JS crash still leaves a downloadable log. */
export async function initDiagnostics(): Promise<void> {
  await loadDiagnosticsEnabled();
}

function sessionMeta(): Record<string, unknown> {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
    nativeBuild: Constants.nativeBuildVersion ?? null,
    runtimeVersion: Constants.expoConfig?.runtimeVersion ?? null,
    channel: Constants.executionEnvironment ?? null,
  };
}

function installCrashHook(): void {
  if (crashHookInstalled || Platform.OS === 'web') return;
  const errorUtils = (
    globalThis as {
      ErrorUtils?: {
        getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
    }
  ).ErrorUtils;
  if (!errorUtils?.getGlobalHandler || !errorUtils.setGlobalHandler) return;
  crashHookInstalled = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    void persistLine({
      ts: new Date().toISOString(),
      event: 'app.exception',
      data: {
        isFatal: Boolean(isFatal),
        name: error?.name ?? 'Error',
        message: error?.message ?? 'unknown',
      },
    }).finally(() => {
      previous?.(error, isFatal);
    });
  });
}

async function persistLine(entry: Record<string, unknown>): Promise<void> {
  const dir = await ensureDir();
  if (!dir) return;
  const uri = `${dir}${LOG_FILE}`;
  const line = `${JSON.stringify(entry)}\n`;
  const info = await FileSystem.getInfoAsync(uri);
  const exists = info.exists && !info.isDirectory;
  const size = exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (exists && size + line.length > MAX_LOG_BYTES) {
    let existing = '';
    try {
      existing = await FileSystem.readAsStringAsync(uri);
    } catch {
      existing = '';
    }
    let next = existing + line;
    if (next.length > MAX_LOG_BYTES) {
      next = next.slice(next.length - MAX_LOG_BYTES);
      const cut = next.indexOf('\n');
      if (cut >= 0) next = next.slice(cut + 1);
    }
    await FileSystem.writeAsStringAsync(uri, next, { encoding: FileSystem.EncodingType.UTF8 });
    return;
  }
  await FileSystem.writeAsStringAsync(uri, line, {
    encoding: FileSystem.EncodingType.UTF8,
    append: exists,
  });
}

export async function setDiagnosticsEnabled(enabled: boolean): Promise<void> {
  const dir = await ensureDir();
  enabledCache = enabled;
  if (!dir) return;
  await FileSystem.writeAsStringAsync(
    `${dir}${ENABLED_FILE}`,
    JSON.stringify({ enabled, updatedAt: new Date().toISOString() }),
    { encoding: FileSystem.EncodingType.UTF8 },
  );
  if (enabled) {
    installCrashHook();
    await persistLine({
      ts: new Date().toISOString(),
      event: 'diagnostics.enabled',
      data: sessionMeta(),
    });
  } else {
    await persistLine({
      ts: new Date().toISOString(),
      event: 'diagnostics.disabled',
      data: {},
    });
  }
}

/**
 * Turn logging on and write a session line so Download log file is available
 * for Connect / Backup now / Restore from Drive.
 */
export async function activateBackupRestoreLogging(
  kind: 'backup' | 'restore' | 'connect',
): Promise<void> {
  await setDiagnosticsEnabled(true);
  await persistLine({
    ts: new Date().toISOString(),
    event: 'backup.session.start',
    data: { kind, ...sessionMeta() },
  });
}

/** Safe fields from thrown errors for diagnostic JSONL (no tokens). */
export function diagnosticErrorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: typeof error === 'string' ? error : 'unknown' };
  }
  const withCode = error as Error & { code?: unknown };
  return {
    name: error.name,
    message: error.message,
    code: withCode.code != null ? String(withCode.code) : null,
  };
}

export async function logDiagnostic(event: string, data?: Record<string, unknown>): Promise<void> {
  if (enabledCache === null) {
    await loadDiagnosticsEnabled();
  }
  const always =
    event.startsWith('drive.') ||
    event.startsWith('backup.') ||
    event.startsWith('google.') ||
    event.startsWith('catalog.') ||
    event.startsWith('app.');
  if (!always && !isDiagnosticsEnabled()) return;
  const payload = {
    ts: new Date().toISOString(),
    event,
    data: data ? (redactValue(data) as Record<string, unknown>) : {},
  };
  writeChain = writeChain.then(
    () => persistLine(payload),
    () => persistLine(payload),
  );
  await writeChain;
}

export async function getDiagnosticsLogInfo(): Promise<{
  exists: boolean;
  bytes: number;
  uri: string | null;
  modifiedAt: string | null;
}> {
  const uri = logFileUri();
  if (!uri) return { exists: false, bytes: 0, uri: null, modifiedAt: null };
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const bytes = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
    const modifiedAt =
      info.exists && 'modificationTime' in info && typeof info.modificationTime === 'number'
        ? new Date(info.modificationTime * 1000).toISOString()
        : null;
    return { exists: Boolean(info.exists && !info.isDirectory), bytes, uri, modifiedAt };
  } catch {
    return { exists: false, bytes: 0, uri, modifiedAt: null };
  }
}

export async function clearDiagnosticsLog(): Promise<void> {
  const uri = logFileUri();
  if (!uri) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
  if (isDiagnosticsEnabled()) {
    await persistLine({
      ts: new Date().toISOString(),
      event: 'diagnostics.cleared',
      data: sessionMeta(),
    });
  }
}

/**
 * Save/download the on-device log via the system sheet (Files, Drive, email).
 * The source file lives in app documents, so it remains after a crash until Clear.
 */
export async function downloadDiagnosticsLog(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Diagnostic logs can be downloaded from the Android and iOS apps.');
  }
  const info = await getDiagnosticsLogInfo();
  if (!info.exists || !info.uri) {
    throw new Error('No diagnostic log on this phone yet. Run Backup now or Restore from Drive, then download.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Saving files is not available on this device.');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const downloadUri = `${FileSystem.cacheDirectory}artcloset-diagnostics-${stamp}.txt`;
  const contents = await FileSystem.readAsStringAsync(info.uri);
  const header =
    'ArtCloset backup diagnostics\n' +
    `Email this file to ${SUPPORT_EMAIL}\n` +
    'Tokens and Authorization headers are redacted.\n\n';
  await FileSystem.writeAsStringAsync(downloadUri, header + contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(downloadUri, {
    mimeType: 'text/plain',
    dialogTitle: 'Download ArtCloset diagnostic log',
    UTI: 'public.plain-text',
  });
}

export const shareDiagnosticsLog = downloadDiagnosticsLog;
