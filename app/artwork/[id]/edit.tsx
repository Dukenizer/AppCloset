import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { draftFromArtwork, type Artwork } from '@/domain/artwork';
import { ArtworkForm } from '@/features/artworks/ArtworkForm';
import { useArtworks } from '@/state/ArtworkContext';
import { ScreenState } from '@/ui/components';

export default function EditArtworkScreen(): React.JSX.Element {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const { findById, update } = useArtworks();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!Number.isInteger(id) || id <= 0) {
      setError('Invalid artwork ID.');
      setLoading(false);
      return;
    }
    void findById(id)
      .then((value) => {
        if (active) setArtwork(value);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load this artwork.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [findById, id]);

  if (loading || error || !artwork) {
    return <ScreenState loading={loading} error={error ?? (!artwork ? 'Artwork not found.' : null)} />;
  }

  return (
    <ArtworkForm
      initialValue={draftFromArtwork(artwork)}
      submitLabel="Save changes"
      busy={busy}
      onSubmit={async (draft) => {
        setBusy(true);
        try {
          await update(id, draft);
          router.back();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
