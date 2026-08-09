import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getUserProfile } from '@/data/artworkRepository';
import { EMPTY_ARTWORK_DRAFT, createArtworkHumanId } from '@/domain/artwork';
import { ArtworkForm } from '@/features/artworks/ArtworkForm';
import { useArtworks } from '@/state/ArtworkContext';

export default function AddArtworkScreen(): React.JSX.Element {
  const database = useSQLiteContext();
  const { create } = useArtworks();
  const params = useLocalSearchParams<{ collection?: string | string[] }>();
  const collectionParam = Array.isArray(params.collection) ? params.collection[0] : params.collection;
  const preselectedCollection = collectionParam?.trim() ?? '';
  const [busy, setBusy] = useState(false);
  const [initialValue, setInitialValue] = useState({
    ...EMPTY_ARTWORK_DRAFT,
    humanId: createArtworkHumanId(),
    collections: preselectedCollection ? [preselectedCollection] : [],
  });

  useEffect(() => {
    void getUserProfile(database).then((profile) => {
      setInitialValue((current) => ({
        ...current,
        currency: profile.defaultCurrency,
        measurementUnit: profile.displayUnit,
        collections: preselectedCollection ? [preselectedCollection] : current.collections,
      }));
    });
  }, [database, preselectedCollection]);

  return (
    <ArtworkForm
      initialValue={initialValue}
      submitLabel="Save artwork"
      busy={busy}
      requirePhoto
      isNew
      onSubmit={async (draft) => {
        setBusy(true);
        try {
          const id = await create(draft);
          router.replace({ pathname: '/artwork/[id]', params: { id } });
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
