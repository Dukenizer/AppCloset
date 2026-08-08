import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  archiveArtwork,
  attachImage,
  createArtwork,
  detachImage,
  discardFailedArtwork,
  getArtwork,
  listArtworks,
  updateArtwork,
} from '@/data/artworkRepository';
import type { Artwork, ArtworkDraft, ArtworkQuery } from '@/domain/artwork';
import { deleteStoredImage, storeArtworkImage } from '@/services/imageStorage';

interface ArtworkContextValue {
  artworks: Artwork[];
  query: ArtworkQuery;
  loading: boolean;
  error: string | null;
  setQuery: (query: ArtworkQuery) => void;
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

  const load = useCallback(
    async (nextQuery: ArtworkQuery): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        setArtworks(await listArtworks(database, nextQuery));
      } catch (loadError) {
        setError(messageFromError(loadError));
      } finally {
        setLoading(false);
      }
    },
    [database],
  );

  const setQuery = useCallback(
    (nextQuery: ArtworkQuery): void => {
      setQueryState(nextQuery);
      void load(nextQuery);
    },
    [load],
  );

  const refresh = useCallback(() => load(query), [load, query]);

  const create = useCallback(
    async (draft: ArtworkDraft): Promise<number> => {
      const storedImage = draft.pendingImageUri ? await storeArtworkImage(draft.pendingImageUri) : null;
      let createdId: number | null = null;
      try {
        const id = await createArtwork(database, draft);
        createdId = id;
        if (storedImage) await attachImage(database, id, storedImage);
        await refresh();
        return id;
      } catch (createError) {
        try {
          if (createdId !== null) await discardFailedArtwork(database, createdId);
        } finally {
          if (storedImage) deleteStoredImage(storedImage.uri);
        }
        throw createError;
      }
    },
    [database, refresh],
  );

  const update = useCallback(
    async (id: number, draft: ArtworkDraft): Promise<void> => {
      const previous = await getArtwork(database, id);
      await updateArtwork(database, id, draft);
      if (draft.pendingImageUri && draft.pendingImageUri !== previous?.primaryImageUri) {
        const storedImage = await storeArtworkImage(draft.pendingImageUri);
        try {
          await attachImage(database, id, storedImage);
        } catch (attachError) {
          deleteStoredImage(storedImage.uri);
          throw attachError;
        }
        if (previous?.primaryImageUri) {
          await detachImage(database, id, previous.primaryImageUri);
          deleteStoredImage(previous.primaryImageUri);
        }
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
      findById: (id) => getArtwork(database, id),
      create,
      update,
      archive,
    }),
    [archive, artworks, create, database, error, loading, query, refresh, setQuery, update],
  );

  return <ArtworkContext.Provider value={value}>{children}</ArtworkContext.Provider>;
}

export function useArtworks(): ArtworkContextValue {
  const context = useContext(ArtworkContext);
  if (!context) throw new Error('useArtworks must be used inside ArtworkProvider.');
  return context;
}
