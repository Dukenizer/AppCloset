export const DEFAULT_GENRE = 'Other';

export const SEED_MEDIUMS = [
  'Oil on canvas',
  'Acrylic on canvas',
  'Watercolor',
  'Gouache',
  'Ink',
  'Charcoal',
  'Pastel',
  'Mixed media',
  'Photography',
  'Digital',
  'Print',
  'Sculpture',
  'Other',
] as const;

export const SEED_MATERIALS = [
  'Canvas',
  'Paper',
  'Board',
  'Wood',
  'Metal',
  'Glass',
  'Fabric',
  'Ceramic',
  'Stone',
  'Other',
] as const;

export const SEED_GENRES = [
  'Abstract',
  'Figurative',
  'Landscape',
  'Portrait',
  'Still life',
  'Conceptual',
  'Street art',
  DEFAULT_GENRE,
] as const;

export const COMPLETION_MONTHS = [
  { value: '', label: 'Month (optional)' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const;

export const formatCompletionLabel = (year: number | null, month: number | null): string | null => {
  if (year === null) return null;
  if (month === null || month < 1 || month > 12) return String(year);
  const monthName = COMPLETION_MONTHS.find((entry) => entry.value === String(month))?.label;
  return monthName ? `${monthName} ${year}` : String(year);
};
