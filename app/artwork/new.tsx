import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getUserProfile } from '@/data/artworkRepository';
import { EMPTY_ARTWORK_DRAFT, createArtworkHumanId, type ArtworkDraft } from '@/domain/artwork';
import { ArtworkForm } from '@/features/artworks/ArtworkForm';
import { useArtworks } from '@/state/ArtworkContext';

function savedNotice(title: string, collections: string[]): string {
  if (collections.length === 1) return `Saved “${title}” to ${collections[0]}. Add the next one.`;
  if (collections.length > 1) return `Saved “${title}” to ${collections.length} collections. Add the next one.`;
  return `Saved “${title}”. Add the next one.`;
}

export default function AddArtworkScreen(): React.JSX.Element {
  const database = useSQLiteContext();
  const { create } = useArtworks();
  const params = useLocalSearchParams<{ collection?: string | string[] }>();
  const collectionParam = Array.isArray(params.collection) ? params.collection[0] : params.collection;
  const preselectedCollection = collectionParam?.trim() ?? '';
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const [initialValue, setInitialValue] = useState<ArtworkDraft>({
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

  const save = async (draft: ArtworkDraft): Promise<number> => {
    setBusy(true);
    try {
      return await create(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ArtworkForm
      key={formKey}
      initialValue={initialValue}
      submitLabel="Save artwork"
      busy={busy}
      requirePhoto
      isNew
      notice={notice}
      onSubmit={async (draft) => {
        const id = await save(draft);
        router.replace({ pathname: '/artwork/[id]', params: { id, justCreated: '1' } });
      }}
      onSubmitAndAddAnother={async (draft) => {
        await save(draft);
        setInitialValue({
          ...EMPTY_ARTWORK_DRAFT,
          humanId: createArtworkHumanId(),
          currency: draft.currency,
          measurementUnit: draft.measurementUnit,
          collections: draft.collections,
        });
        setNotice(savedNotice(draft.title.trim(), draft.collections));
        setFormKey((key) => key + 1);
      }}
    />
  );
}
