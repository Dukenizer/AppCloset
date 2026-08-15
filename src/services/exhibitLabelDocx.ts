import { zipSync, strToU8 } from 'fflate';

import {
  EXHIBIT_LABEL_SIZE_SPECS,
  letterSheetGrid,
  type ExhibitLabelContent,
  type ExhibitLabelLayout,
  type ExhibitLabelSize,
} from '@/domain/exhibitLabel';

/** 1 inch = 1440 twips (Word OOXML). */
const INCH = 1440;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const typographyForSize = (size: ExhibitLabelSize): { titleHalfPoints: number; bodyHalfPoints: number } => {
  if (size === '2x3') return { titleHalfPoints: 17, bodyHalfPoints: 14 };
  return { titleHalfPoints: 20, bodyHalfPoints: 17 };
};

const centeredParagraph = (text: string, halfPoints: number, bold = false, uppercase = false): string => {
  const display = uppercase ? text.toUpperCase() : text;
  return `
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="60" w:after="60"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
          <w:sz w:val="${halfPoints}"/>
          <w:szCs w:val="${halfPoints}"/>
          ${bold ? '<w:b/><w:bCs/>' : ''}
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(display)}</w:t>
      </w:r>
    </w:p>`;
};

const labelParagraphs = (entry: ExhibitLabelContent, size: ExhibitLabelSize): string => {
  const type = typographyForSize(size);
  const parts = [
    centeredParagraph(entry.title || 'Untitled', type.titleHalfPoints, true),
    centeredParagraph(entry.artist || 'Artist not specified', type.bodyHalfPoints, false, true),
  ];
  if (entry.date.trim()) parts.push(centeredParagraph(entry.date.trim(), type.bodyHalfPoints));
  if (entry.medium.trim()) parts.push(centeredParagraph(entry.medium.trim(), type.bodyHalfPoints));
  return parts.join('');
};

const labelCell = (entry: ExhibitLabelContent | null, widthTwips: number, size: ExhibitLabelSize): string => {
  const border = entry
    ? `<w:tcBorders>
        <w:top w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
        <w:left w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
        <w:bottom w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
        <w:right w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
      </w:tcBorders>`
    : `<w:tcBorders>
        <w:top w:val="dotted" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left w:val="dotted" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="dotted" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right w:val="dotted" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tcBorders>`;

  return `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${widthTwips}" w:type="dxa"/>
        <w:vAlign w:val="center"/>
        ${border}
        <w:tcMar>
          <w:top w:w="120"/>
          <w:left w:w="120"/>
          <w:bottom w:w="120"/>
          <w:right w:w="120"/>
        </w:tcMar>
      </w:tcPr>
      ${entry ? labelParagraphs(entry, size) : '<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>'}
    </w:tc>`;
};

const letterSheetTables = (labels: ExhibitLabelContent[], size: ExhibitLabelSize): string => {
  const grid = letterSheetGrid(size);
  const cellW = Math.round(grid.labelWidthIn * INCH);
  const cellH = Math.round(grid.labelHeightIn * INCH);
  const chunks: (ExhibitLabelContent | null)[][] = [];
  for (let i = 0; i < labels.length; i += grid.perPage) {
    const page: (ExhibitLabelContent | null)[] = labels.slice(i, i + grid.perPage);
    while (page.length < grid.perPage) page.push(null);
    chunks.push(page);
  }
  if (chunks.length === 0) chunks.push(Array.from({ length: grid.perPage }, () => null));

  return chunks
    .map((chunk, sheetIndex) => {
      const rows: string[] = [];
      for (let r = 0; r < grid.rows; r++) {
        const cells: string[] = [];
        for (let c = 0; c < grid.columns; c++) {
          const entry = chunk[r * grid.columns + c] ?? null;
          cells.push(labelCell(entry, cellW, size));
        }
        rows.push(`
          <w:tr>
            <w:trPr>
              <w:trHeight w:val="${cellH}" w:hRule="exact"/>
            </w:trPr>
            ${cells.join('')}
          </w:tr>`);
      }

      const table = `
        <w:tbl>
          <w:tblPr>
            <w:tblW w:w="0" w:type="auto"/>
            <w:tblLayout w:type="fixed"/>
            <w:tblCellMar>
              <w:top w:w="0"/><w:left w:w="0"/><w:bottom w:w="0"/><w:right w:w="0"/>
            </w:tblCellMar>
          </w:tblPr>
          <w:tblGrid>
            ${Array.from({ length: grid.columns }, () => `<w:gridCol w:w="${cellW}"/>`).join('')}
          </w:tblGrid>
          ${rows.join('')}
        </w:tbl>`;

      // Spacer between logical columns is handled by fixed cell widths; add page break after each sheet except last.
      if (sheetIndex < chunks.length - 1) {
        return `${table}<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      }
      return table;
    })
    .join('\n');
};

const labelStockBody = (labels: ExhibitLabelContent[], size: ExhibitLabelSize): string => {
  const spec = EXHIBIT_LABEL_SIZE_SPECS[size];
  const pageW = Math.round(spec.widthIn * INCH);
  const pageH = Math.round(spec.heightIn * INCH);
  const margin = Math.round(0.14 * INCH);

  return labels
    .map((entry, index) => {
      const content = `
        <w:tbl>
          <w:tblPr>
            <w:tblW w:w="${pageW - margin * 2}" w:type="dxa"/>
            <w:tblLayout w:type="fixed"/>
          </w:tblPr>
          <w:tblGrid><w:gridCol w:w="${pageW - margin * 2}"/></w:tblGrid>
          <w:tr>
            <w:trPr><w:trHeight w:val="${pageH - margin * 2}" w:hRule="exact"/></w:trPr>
            ${labelCell(entry, pageW - margin * 2, size)}
          </w:tr>
        </w:tbl>`;

      const sectPr = `
        <w:sectPr>
          <w:pgSz w:w="${pageW}" w:h="${pageH}"/>
          <w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="0" w:footer="0" w:gutter="0"/>
        </w:sectPr>`;

      if (index < labels.length - 1) {
        return `${content}<w:p>${sectPr}</w:p>`;
      }
      return `${content}<w:p/><w:sectPr>
          <w:pgSz w:w="${pageW}" w:h="${pageH}"/>
          <w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="0" w:footer="0" w:gutter="0"/>
        </w:sectPr>`;
    })
    .join('\n');
};

const letterSectPr = (size: ExhibitLabelSize): string => {
  const grid = letterSheetGrid(size);
  const margin = Math.round(grid.marginIn * INCH);
  return `
    <w:sectPr>
      <w:pgSz w:w="${Math.round(grid.pageWidthIn * INCH)}" w:h="${Math.round(grid.pageHeightIn * INCH)}"/>
      <w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>`;
};

const buildDocumentXml = (
  labels: ExhibitLabelContent[],
  size: ExhibitLabelSize,
  layout: ExhibitLabelLayout,
): string => {
  const body =
    layout === 'label-stock'
      ? labelStockBody(labels, size)
      : `${letterSheetTables(labels, size)}${letterSectPr(size)}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${body}
  </w:body>
</w:document>`;
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

const CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>ArtCloset exhibit labels</dc:title>
  <dc:creator>ArtCloset</dc:creator>
  <cp:lastModifiedBy>ArtCloset</cp:lastModifiedBy>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ArtCloset</Application>
</Properties>`;

/** Build a .docx (OOXML zip) matching PDF label size and centered text. */
export function buildExhibitLabelsDocxBytes(
  labels: ExhibitLabelContent[],
  size: ExhibitLabelSize,
  layout: ExhibitLabelLayout = 'letter-sheet',
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'word/document.xml': strToU8(buildDocumentXml(labels, size, layout)),
    'word/_rels/document.xml.rels': strToU8(DOC_RELS),
    'docProps/core.xml': strToU8(CORE_XML),
    'docProps/app.xml': strToU8(APP_XML),
  };
  return zipSync(files, { level: 6 });
}

export function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}
