import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  archiveArtwork,
  createArtwork,
  createArtworkBatch,
  getArtwork,
  getArtworkStats,
  getSetting,
  getUserProfile,
  listArtworks,
  setSetting,
  updateArtwork,
  updateArtworkWithImage,
} from '@/data/artworkRepository';
import {
  ARTWORK_STATUSES,
  ORIENTATIONS,
  type Artwork,
  type ArtworkDraft,
  type ArtworkOrientation,
  type ArtworkQuery,
  type ArtworkSort,
  type ArtworkStats,
  type ArtworkStatus,
  type BatchArtworkItem,
} from '@/domain/artwork';
import { SIZE_BUCKETS, type SizeBucket } from '@/domain/dimensions';
import { deleteStoredImage, storeArtworkImage } from '@/services/imageStorage';

interface ArtworkContextValue {
  artworks: Artwork[];
  query: ArtworkQuery;
  stats: ArtworkStats;
  globalTotal: number;
  loading: boolean;
  error: string | null;
  setQuery: Dispatch<SetStateAction<ArtworkQuery>>;
  refresh: () => Promise<void>;
  findById: (id: number) => Promise<Artwork | null>;
  create: (draft: ArtworkDraft) => Promise<number>;
  createBatch: (items: BatchArtworkItem[]) => Promise<number[]>;
  update: (id: number, draft: ArtworkDraft) => Promise<void>;
  archive: (artwork: Artwork) => Promise<void>;
}

const ArtworkContext = createContext<ArtworkContextValue | null>(null);

const ARCHIVE_QUERY_SETTING = 'archive_query_v1';

const initialQuery: ArtworkQuery = {
  search: '',
  status: null,
  sort: 'recently-updated',
  year: '',
  dateFrom: '',
  dateTo: '',
  artist: '',
  genre: '',
  tag: '',
  medium: '',
  material: '',
  collection: '',
  collectionId: null,
  orientation: null,
  sizeBucket: null,
};

const isArtworkStatus = (value: unknown): value is ArtworkStatus =>
  typeof value === 'string' && (ARTWORK_STATUSES as readonly string[]).includes(value);

const isArtworkSort = (value: unknown): value is ArtworkSort =>
  typeof value === 'string' &&
  [
    'newest',
    'oldest',
    'recently-added',
    'recently-updated',
    'title-asc',
    'title-desc',
    'artwork-id',
    'status',
  ].includes(value);

const isOrientation = (value: unknown): value is ArtworkOrientation =>
  typeof value === 'string' && (ORIENTATIONS as readonly string[]).includes(value);

const isSizeBucket = (value: unknown): value is SizeBucket =>
  typeof value === 'string' && (SIZE_BUCKETS as readonly string[]).includes(value);

const parseStoredQuery = (raw: string | null): Partial<ArtworkQuery> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<ArtworkQuery> = {};
    if (parsed.status === null || isArtworkStatus(parsed.status)) next.status = parsed.status;
    if (isArtworkSort(parsed.sort)) next.sort = parsed.sort;
    if (typeof parsed.year === 'string') next.year = parsed.year;
    if (parsed.collectionId === null || typeof parsed.collectionId === 'number') {
      next.collectionId = parsed.collectionId;
    }
    if (typeof parsed.dateFrom === 'string') next.dateFrom = parsed.dateFrom;
    if (typeof parsed.dateTo === 'string') next.dateTo = parsed.dateTo;
    if (typeof parsed.artist === 'string') next.artist = parsed.artist;
    if (typeof parsed.genre === 'string') next.genre = parsed.genre;
    if (typeof parsed.tag === 'string') next.tag = parsed.tag;
    if (typeof parsed.medium === 'string') next.medium = parsed.medium;
    if (typeof parsed.material === 'string') next.material = parsed.material;
    if (typeof parsed.collection === 'string') next.collection = parsed.collection;
    if (parsed.orientation === null || isOrientation(parsed.orientation)) {
      next.orientation = parsed.orientation;
    }
    if (parsed.sizeBucket === null || isSizeBucket(parsed.sizeBucket)) {
      next.sizeBucket = parsed.sizeBucket;
    }
    return next;
  } catch {
    return {};
  }
};

const persistedQueryPayload = (query: ArtworkQuery): string =>
  JSON.stringify({
    status: query.status,
    sort: query.sort,
    year: query.year,
    collectionId: query.collectionId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    artist: query.artist,
    genre: query.genre,
    tag: query.tag,
    medium: query.medium,
    material: query.material,
    collection: query.collection,
    orientation: query.orientation,
    sizeBucket: query.sizeBucket,
  });

const messageFromError = (error: unknown): string =>
  error instanceof Error ? error.message : 'An unexpected error occurred.';

export function ArtworkProvider({ children }: PropsWithChildren): React.JSX.Element {
  const database = useSQLiteContext();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [stats, setStats] = useState<ArtworkStats>({ total: 0, available: 0, sold: 0, exhibiting: 0 });
  const [globalTotal, setGlobalTotal] = useState(0);
  const [query, setQueryState] = useState<ArtworkQuery>(initialQuery);
  const [queryReady, setQueryReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestLoadId = useRef(0);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    let active = true;
    void getSetting(database, ARCHIVE_QUERY_SETTING).then((raw) => {
      if (!active) return;
      const stored = parseStoredQuery(raw);
      setQueryState((current) => ({ ...current, ...stored }));
      setQueryReady(true);
    });
    return () => {
      active = false;
    };
  }, [database]);

  useEffect(() => {
    if (!queryReady) return;
    void setSetting(database, ARCHIVE_QUERY_SETTING, persistedQueryPayload(query));
  }, [database, query, queryReady]);

  const load = useCallback(
    async (nextQuery: ArtworkQuery): Promise<void> => {
      const loadId = ++latestLoadId.current;
      // Soft-refresh after the first load so filter/search updates do not
      // remount the archive UI (and dismiss the keyboard).
      if (!hasLoadedOnce.current) setLoading(true);
      setError(null);
      try {
        const [result, filteredStats, globalStats] = await Promise.all([
          listArtworks(database, nextQuery),
          getArtworkStats(database, nextQuery.collectionId),
          getArtworkStats(database, null),
        ]);
        if (loadId === latestLoadId.current) {
          setArtworks(result);
          setStats(filteredStats);
          setGlobalTotal(globalStats.total);
          hasLoadedOnce.current = true;
        }
      } catch (loadError) {
        if (loadId === latestLoadId.current) setError(messageFromError(loadError));
      } finally {
        if (loadId === latestLoadId.current) setLoading(false);
      }
    },
    [database],
  );

  const setQuery = useCallback((nextQuery: SetStateAction<ArtworkQuery>): void => {
    setQueryState(nextQuery);
  }, []);

  const refresh = useCallback(() => load(query), [load, query]);
  const findById = useCallback((id: number) => getArtwork(database, id), [database]);

  useEffect(() => {
    if (!queryReady) return;
    void load(query);
  }, [load, query, queryReady]);

  const create = useCallback(
    async (draft: ArtworkDraft): Promise<number> => {
      const storedImage = draft.pendingImageUri ? await storeArtworkImage(draft.pendingImageUri) : null;
      try {
        const id = await createArtwork(database, draft, storedImage);
        await refresh();
        return id;
      } catch (createError) {
        if (storedImage) deleteStoredImage(storedImage.uri);
        throw createError;
      }
    },
    [database, refresh],
  );

  const createBatch = useCallback(
    async (items: BatchArtworkItem[]): Promise<number[]> => {
      const profile = await getUserProfile(database);
      const storedImages: { uri: string; width: number; height: number; fileSize: number | null }[] = [];
      try {
        for (const item of items) {
          storedImages.push(await storeArtworkImage(item.pendingImageUri));
        }
        const ids = await createArtworkBatch(
          database,
          items.map((item, index) => ({
            title: item.title,
            image: storedImages[index]!,
          })),
          profile.defaultCurrency,
        );
        await refresh();
        return ids;
      } catch (batchError) {
        for (const image of storedImages) deleteStoredImage(image.uri);
        throw batchError;
      }
    },
    [database, refresh],
  );

  const update = useCallback(
    async (id: number, draft: ArtworkDraft): Promise<void> => {
      const previous = await getArtwork(database, id);
      if (!previous) throw new Error('This artwork no longer exists.');
      if (draft.pendingImageUri && draft.pendingImageUri !== previous?.primaryImageUri) {
        const storedImage = await storeArtworkImage(draft.pendingImageUri);
        try {
          await updateArtworkWithImage(database, id, draft, storedImage, previous?.primaryImageUri ?? null);
        } catch (updateError) {
          deleteStoredImage(storedImage.uri);
          throw updateError;
        }
        if (previous?.primaryImageUri) deleteStoredImage(previous.primaryImageUri);
      } else {
        await updateArtwork(database, id, draft);
      }
      await refresh();
    },
    [database, refresh],
  );

  const archive = useCallback(
    async (artwork: Artwork): Promise<void> => {
      await archiveArtwork(database, artwork.id);
      await refresh();
    },
    [database, refresh],
  );

  const value = useMemo<ArtworkContextValue>(
    () => ({
      artworks,
      query,
      stats,
      globalTotal,
      loading,
      error,
      setQuery,
      refresh,
      findById,
      create,
      createBatch,
      update,
      archive,
    }),
    [archive, artworks, create, createBatch, error, findById, globalTotal, loading, query, refresh, setQuery, stats, update],
  );

  return <ArtworkContext.Provider value={value}>{children}</ArtworkContext.Provider>;
}

export function useArtworks(): ArtworkContextValue {
  const context = useContext(ArtworkContext);
  if (!context) throw new Error('useArtworks must be used inside ArtworkProvider.');
  return context;
}
