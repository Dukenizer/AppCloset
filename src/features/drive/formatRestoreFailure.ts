export function formatRestoreFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Something went wrong.';
  if (
    /disk I\/O|prepareAsync|NativeDatabase|NativeStatement|finalizeAsync|unable to open database file/i.test(
      raw,
    )
  ) {
    return (
      'Could not open the backup catalog on this phone. ' +
      'Wait a moment and tap Restore from backup again. ' +
      'If it still fails, force-close ArtCloset and retry.'
    );
  }
  return raw;
}
