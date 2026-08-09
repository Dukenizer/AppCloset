import { useState } from 'react';
import { router } from 'expo-router';

import { EMPTY_ARTWORK_DRAFT } from '@/domain/artwork';
import { ArtworkForm } from '@/features/artworks/ArtworkForm';
import { useArtworks } from '@/state/ArtworkContext';

const createHumanId = (): string => {
  const now = new Date();
  const compact = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return `AC-${compact}`;
};

export default function AddArtworkScreen(): React.JSX.Element {
  const { create } = useArtworks();
  const [busy, setBusy] = useState(false);

  return (
    <ArtworkForm
      initialValue={{ ...EMPTY_ARTWORK_DRAFT, humanId: createHumanId() }}
      submitLabel="Save artwork"
      busy={busy}
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
