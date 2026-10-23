import { layout } from "./pipeline-layout";
import type { Layout, LayoutCell } from "./types";

/** The English alphabet: 52 letters in two printed pages, A to Z and a to z. Kept apart from the Thaana letters. */
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const LOWER = "abcdefghijklmnopqrstuvwxyz";

/** Inter is 727 units tall in capitals; the letters here are 494, so they stand as tall as the Thaana letters. */
export const LATIN_SCALE = 494 / 727;
/** Where the tops of small letters reach (Inter's x-height 546, scaled). */
export const X_HEIGHT = Math.round(546 * LATIN_SCALE);

export const ALPHABET_FIRST_PAGE_ID = 91;       // sheet ids 1 and 2 are the template, 3 up are joined letters

const first = layout.sheets[0].cells;
const CELL_W = first[0].w, CELL_H = first[0].h;
const GX = Math.min(...first.map((c) => c.x)), GY = Math.min(...first.map((c) => c.y));
const COLS = 6;
const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, "0");

export const isLower = (label: string) => label !== label.toUpperCase();

export type AlphabetPage = { id: number; title: string; cells: LayoutCell[] };

function page(id: number, title: string, letters: string): AlphabetPage {
  const cells = Array.from(letters).map((ch, i) => {
    const r = Math.floor(i / COLS), c = i % COLS, cp = ch.codePointAt(0)!;
    return {
      id: hex(cp), cp: [cp], kind: "latin" as const,
      x: GX + c * CELL_W, y: GY + r * CELL_H, w: CELL_W, h: CELL_H,     // left to right, unlike the Thaana sheets
      label: ch, code: `U+${hex(cp)}`,
    };
  });
  return { id, title, cells };
}

export const ALPHABET_PAGES: AlphabetPage[] = [
  page(ALPHABET_FIRST_PAGE_ID, "Alphabet · A to Z", UPPER),
  page(ALPHABET_FIRST_PAGE_ID + 1, "Alphabet · a to z", LOWER),
];

export const ALPHABET_CELLS: LayoutCell[] = ALPHABET_PAGES.flatMap((p) => p.cells);

/** The template layout with the alphabet pages added, so a photo of one reads like any other sheet. */
export function withAlphabet(): Layout {
  return { ...layout, sheets: [...layout.sheets, ...ALPHABET_PAGES] };
}
