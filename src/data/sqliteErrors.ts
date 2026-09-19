/** True when expo-sqlite rejected a call because the native DB handle was already closed. */
export const isSqliteClosedError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return /closed resource|NativeDatabase\.(prepare|get|run|exec)|Access to closed resource/i.test(
    error.message,
  );
};
