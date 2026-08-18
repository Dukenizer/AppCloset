import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

interface CatalogReloadContextValue {
  /** Bumps whenever the SQLite tree remounts after restore. */
  catalogEpoch: number;
  /** True while the SQLite provider is unmounted for a safe file replace. */
  catalogSuspended: boolean;
  /** Artwork count from the last successful Drive restore (cleared after Home consumes it). */
  lastRestoreArtworkCount: number | null;
  /** Unmount SQLiteProvider and wait one frame so file handles are released. */
  suspendCatalog: () => Promise<void>;
  /** Remount SQLiteProvider with a new epoch (runs migrate onInit). */
  resumeCatalog: (restoreArtworkCount?: number) => void;
  /** Home calls this after showing the restored catalog. */
  clearLastRestoreArtworkCount: () => void;
}

const CatalogReloadContext = createContext<CatalogReloadContextValue | null>(null);

export function CatalogReloadProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [catalogSuspended, setCatalogSuspended] = useState(false);
  const [lastRestoreArtworkCount, setLastRestoreArtworkCount] = useState<number | null>(null);
  const suspendWaiters = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!catalogSuspended) return;
    // Wait for SQLiteProvider teardown closeAsync before replacing artcloset.db.
    const timer = setTimeout(() => {
      const waiters = suspendWaiters.current;
      suspendWaiters.current = [];
      for (const resolve of waiters) resolve();
    }, 600);
    return () => clearTimeout(timer);
  }, [catalogSuspended]);

  const suspendCatalog = useCallback(async (): Promise<void> => {
    if (catalogSuspended) return;
    await new Promise<void>((resolve) => {
      suspendWaiters.current.push(resolve);
      setCatalogSuspended(true);
    });
  }, [catalogSuspended]);

  const resumeCatalog = useCallback((restoreArtworkCount?: number): void => {
    if (typeof restoreArtworkCount === 'number') {
      setLastRestoreArtworkCount(restoreArtworkCount);
    }
    setCatalogEpoch((value) => value + 1);
    setCatalogSuspended(false);
  }, []);

  const clearLastRestoreArtworkCount = useCallback((): void => {
    setLastRestoreArtworkCount(null);
  }, []);

  const value = useMemo(
    () => ({
      catalogEpoch,
      catalogSuspended,
      lastRestoreArtworkCount,
      suspendCatalog,
      resumeCatalog,
      clearLastRestoreArtworkCount,
    }),
    [
      catalogEpoch,
      catalogSuspended,
      lastRestoreArtworkCount,
      suspendCatalog,
      resumeCatalog,
      clearLastRestoreArtworkCount,
    ],
  );

  return <CatalogReloadContext.Provider value={value}>{children}</CatalogReloadContext.Provider>;
}


export function useCatalogReload(): CatalogReloadContextValue {
  const context = useContext(CatalogReloadContext);
  if (!context) {
    throw new Error('useCatalogReload must be used inside CatalogReloadProvider.');
  }
  return context;
}
