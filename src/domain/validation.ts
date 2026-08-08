import type { ArtworkDraft } from './artwork';

export type ValidationErrors = Partial<Record<keyof ArtworkDraft, string>>;

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function validateArtwork(draft: ArtworkDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  const currentYear = new Date().getFullYear();
  const year = parseOptionalNumber(draft.completionYear);

  if (!draft.title.trim()) errors.title = 'Title is required.';
  if (draft.title.trim().length > 200) errors.title = 'Title must be 200 characters or fewer.';
  if (!draft.humanId.trim()) errors.humanId = 'Artwork ID is required.';
  if (draft.humanId.trim().length > 80) errors.humanId = 'Artwork ID must be 80 characters or fewer.';
  if (year !== null && (!Number.isInteger(year) || year < 1000 || year > currentYear + 10)) {
    errors.completionYear = 'Enter a valid four-digit year.';
  }
  if (draft.completionDate && Number.isNaN(Date.parse(draft.completionDate))) {
    errors.completionDate = 'Use an ISO date such as 2026-08-08.';
  }

  for (const key of ['width', 'height', 'depth'] as const) {
    const value = parseOptionalNumber(draft[key]);
    if (draft[key].trim() !== '' && (value === null || value <= 0)) {
      errors[key] = 'Enter a number greater than zero.';
    }
  }

  const price = parseOptionalNumber(draft.price);
  if (draft.price.trim() !== '' && (price === null || price < 0)) {
    errors.price = 'Enter a valid non-negative price.';
  }
  if (!/^[A-Z]{3}$/.test(draft.currency)) {
    errors.currency = 'Use a three-letter currency code.';
  }
  return errors;
}

export function toNullableNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export function priceToMinorUnits(value: string): number | null {
  const number = toNullableNumber(value);
  return number === null ? null : Math.round(number * 100);
}
