export type Pt = { x: number; y: number };

/** One point of a closed outline. Handles are relative to the point, like paper.js. y is up, in font units. */
export type Seg = { p: Pt; hi: Pt; ho: Pt };
export type Contour = Seg[];

export type CellKind = "letter" | "fili" | "symbol" | "latin";   // latin: the English alphabet, kept apart from the Thaana letters

export type LayoutCell = {
  id: string; cp: number[]; kind: CellKind;
  x: number; y: number; w: number; h: number; label: string; code: string;
};

export type Layout = {
  page: { w: number; h: number };
  marks: { id: string; cx: number; cy: number; hole?: boolean }[];
  markSize: number;
  guides: { topY: number; baseY: number; writeEnd: number; labelH: number };
  placeholder: { x: number; y: number; w: number; h: number };
  sheets: { id: number; title: string; cells: LayoutCell[] }[];
};

export type Glyph = {
  id: string;            // hex code point, e.g. "0784"
  cp: number[];
  kind: CellKind;
  contours: Contour[];   // font units, y up, baseline at y = 0
  adv: number;           // advance width (0 for marks)
  source?: "photo" | "drawn";   // traced from a photo, or drawn with the pen
  checked?: boolean;     // the person has looked at this one in the clean-up step
};

export type CellStatus = "ok" | "empty" | "light";

export type CellResult = {
  id: string; cp: number[]; kind: CellKind; label: string;
  status: CellStatus;
  warn?: string;         // e.g. touches the edge of its box
  glyph?: Glyph;
};

export const UPEM = 1000;
export const UNITS_PER_MM = 38;   // 13 mm between top line and baseline is about 494 units
export const LSB = 40;            // space left of a drawn letter
