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
  getArtwork,
  listArtworks,
  updateArtwork,
  updateArtworkWithImage,
} from '@/data/artworkRepository';
import type { Artwork, ArtworkDraft, ArtworkQuery } from '@/domain/artwork';
import { deleteStoredImage, storeArtworkImage } from '@/services/imageStorage';

interface ArtworkContextValue {
  artworks: Artwork[];
  query: ArtworkQuery;
  loading: boolean;
  error: string | null;
  setQuery: Dispatch<SetStateAction<ArtworkQuery>>;
  refresh: () => Promise<void>;
  findById: (id: number) => Promise<Artwork | null>;
  create: (draft: ArtworkDraft) => Promise<number>;
  update: (id: number, draft: ArtworkDraft) => Promise<void>;
  archive: (artwork: Artwork) => Promise<void>;
}

const ArtworkContext = createContext<ArtworkContextValue | null>(null);

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
  orientation: null,
  minDimension: '',
  maxDimension: '',
  location: '',
};

const messageFromError = (error: unknown): string =>
  error instanceof Error ? error.message : 'An unexpected error occurred.';

export function ArtworkProvider({ children }: PropsWithChildren): React.JSX.Element {
  const database = useSQLiteContext();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [query, setQueryState] = useState<ArtworkQuery>(initialQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestLoadId = useRef(0);

  const load = useCallback(
    async (nextQuery: ArtworkQuery): Promise<void> => {
      const loadId = ++latestLoadId.current;
      setLoading(true);
      setError(null);
      try {
        const result = await listArtworks(database, nextQuery);
        if (loadId === latestLoadId.current) setArtworks(result);
      } catch (loadError) {
        if (loadId === latestLoadId.current) setError(messageFromError(loadError));
      } finally {
        if (loadId === latestLoadId.current) setLoading(false);
      }
    },
    [database],
  );

  const setQuery = useCallback(
    (nextQuery: SetStateAction<ArtworkQuery>): void => {
      setQueryState(nextQuery);
    },
    [],
  );

  const refresh = useCallback(() => load(query), [load, query]);
  const findById = useCallback((id: number) => getArtwork(database, id), [database]);

  useEffect(() => {
    void load(query);
  }, [load, query]);

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
      loading,
      error,
      setQuery,
      refresh,
      findById,
      create,
      update,
      archive,
    }),
    [archive, artworks, create, error, findById, loading, query, refresh, setQuery, update],
  );

  return <ArtworkContext.Provider value={value}>{children}</ArtworkContext.Provider>;
}

export function useArtworks(): ArtworkContextValue {
  const context = useContext(ArtworkContext);
  if (!context) throw new Error('useArtworks must be used inside ArtworkProvider.');
  return context;
}
