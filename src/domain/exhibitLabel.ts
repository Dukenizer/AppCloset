export const EXHIBIT_LABEL_SIZES = ['2x3', '3x4'] as const;

export type ExhibitLabelSize = (typeof EXHIBIT_LABEL_SIZES)[number];

export const EXHIBIT_LABEL_LAYOUTS = ['letter-sheet', 'label-stock'] as const;

export type ExhibitLabelLayout = (typeof EXHIBIT_LABEL_LAYOUTS)[number];

export interface ExhibitLabelSizeSpec {
  id: ExhibitLabelSize;
  label: string;
  widthIn: number;
  heightIn: number;
}

export const EXHIBIT_LABEL_SIZE_SPECS: Record<ExhibitLabelSize, ExhibitLabelSizeSpec> = {
  '2x3': { id: '2x3', label: '2″ × 3″', widthIn: 2, heightIn: 3 },
  '3x4': { id: '3x4', label: '3″ × 4″', widthIn: 3, heightIn: 4 },
};

export const EXHIBIT_LABEL_LAYOUT_SPECS: Record<
  ExhibitLabelLayout,
  { id: ExhibitLabelLayout; label: string; help: string }
> = {
  'letter-sheet': {
    id: 'letter-sheet',
    label: 'Letter sheet',
    help: 'Packs multiple labels on US Letter (8.5″ × 11″) with cut guides. Best for normal printer paper.',
  },
  'label-stock': {
    id: 'label-stock',
    label: 'Label stock',
    help: 'One label per page at exact label size. Use when printing on pre-cut label sheets.',
  },
};

/** US Letter in points (72 pt = 1 inch). */
export const LETTER_PAGE_POINTS = { width: 8.5 * 72, height: 11 * 72 } as const;

/** PDF page dimensions in points for label-stock mode. */
export const labelPagePoints = (size: ExhibitLabelSize): { width: number; height: number } => {
  const spec = EXHIBIT_LABEL_SIZE_SPECS[size];
  return { width: spec.widthIn * 72, height: spec.heightIn * 72 };
};

export interface LetterSheetGrid {
  columns: number;
  rows: number;
  perPage: number;
  pageWidthIn: number;
  pageHeightIn: number;
  marginIn: number;
  gapIn: number;
  labelWidthIn: number;
  labelHeightIn: number;
}

/** How many labels fit on one US Letter page for the chosen size. */
export function letterSheetGrid(size: ExhibitLabelSize): LetterSheetGrid {
  const spec = EXHIBIT_LABEL_SIZE_SPECS[size];
  const pageWidthIn = 8.5;
  const pageHeightIn = 11;
  const marginIn = 0.35;
  const gapIn = 0.15;
  const usableW = pageWidthIn - marginIn * 2;
  const usableH = pageHeightIn - marginIn * 2;
  const columns = Math.max(1, Math.floor((usableW + gapIn) / (spec.widthIn + gapIn)));
  const rows = Math.max(1, Math.floor((usableH + gapIn) / (spec.heightIn + gapIn)));
  return {
    columns,
    rows,
    perPage: columns * rows,
    pageWidthIn,
    pageHeightIn,
    marginIn,
    gapIn,
    labelWidthIn: spec.widthIn,
    labelHeightIn: spec.heightIn,
  };
}

export interface ExhibitLabelContent {
  title: string;
  artist: string;
  date: string;
  medium: string;
}
