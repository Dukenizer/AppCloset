import type { ArtworkDraft } from './artwork';
import { FULL_DESCRIPTION_MAX_CHARS } from './artwork';

export type ValidationErrors = Partial<Record<keyof ArtworkDraft, string>>;

/** Empty is allowed; otherwise text must be one sentence (no line breaks or second sentence). */
export function isSingleSentence(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/[\r\n]/.test(trimmed)) return false;
  return !/[.!?]\s+\S/.test(trimmed);
}

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function validateArtwork(
  draft: ArtworkDraft,
  options?: { requirePhoto?: boolean; requireCompletionYear?: boolean },
): ValidationErrors {
  const errors: ValidationErrors = {};
  const currentYear = new Date().getFullYear();
  const year = parseOptionalNumber(draft.completionYear);
  const month = parseOptionalNumber(draft.completionMonth);

  if (!draft.title.trim()) errors.title = 'Title is required.';
  if (options?.requirePhoto && !draft.pendingImageUri) {
    errors.pendingImageUri = 'A photo is required.';
  }
  if (draft.title.trim().length > 200) errors.title = 'Title must be 200 characters or fewer.';
  if (draft.shortDescription.trim() && !isSingleSentence(draft.shortDescription)) {
    errors.shortDescription = 'Short description must be a single sentence.';
  }
  if (draft.fullDescription.trim().length > FULL_DESCRIPTION_MAX_CHARS) {
    errors.fullDescription = `Full description must be ${FULL_DESCRIPTION_MAX_CHARS} characters or fewer.`;
  }

  if (options?.requireCompletionYear !== false) {
    if (year === null) errors.completionYear = 'Completion year is required.';
    else if (!Number.isInteger(year) || year < 1000 || year > currentYear + 10) {
      errors.completionYear = 'Enter a valid four-digit year.';
    }
  } else if (year !== null && (!Number.isInteger(year) || year < 1000 || year > currentYear + 10)) {
    errors.completionYear = 'Enter a valid four-digit year.';
  }

  if (draft.completionMonth.trim() !== '') {
    if (month === null || !Number.isInteger(month) || month < 1 || month > 12) {
      errors.completionMonth = 'Choose a month between 1 and 12.';
    }
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
  return errors;
}

export function toNullableNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export function priceToMinorUnits(value: string): number | null {
  const number = toNullableNumber(value);
  return number === null ? null : Math.round(number * 100);
}
