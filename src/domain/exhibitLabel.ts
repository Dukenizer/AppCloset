export const EXHIBIT_LABEL_SIZES = ['2x3', '3x4'] as const;

export type ExhibitLabelSize = (typeof EXHIBIT_LABEL_SIZES)[number];

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

/** PDF page dimensions in points (72 pt = 1 inch). */
export const labelPagePoints = (size: ExhibitLabelSize): { width: number; height: number } => {
  const spec = EXHIBIT_LABEL_SIZE_SPECS[size];
  return { width: spec.widthIn * 72, height: spec.heightIn * 72 };
};

export interface ExhibitLabelContent {
  title: string;
  artist: string;
  date: string;
  medium: string;
}
