import { layout } from "./pipeline-layout";
import { sequenceText, type Ligature } from "./extras";
import type { Layout, LayoutCell } from "./types";

/** Joined letters on paper: one box each, the same size and spacing as sheet 1, six to a row, right to left. */
export const PER_PAGE = 36;
export const FIRST_PAGE_ID = 3;       // sheet 1 is letters, sheet 2 is marks and extras

const first = layout.sheets[0].cells;
const CELL_W = first[0].w, CELL_H = first[0].h;
const GX = Math.min(...first.map((c) => c.x)), GY = Math.min(...first.map((c) => c.y));
const COLS = 6;

export type JoinedPage = { id: number; title: string; cells: LayoutCell[] };

/** The printed pages for these joined letters, in order. Every box is named after its joined letter's id. */
export function joinedPages(ligs: Ligature[]): JoinedPage[] {
  const pages: JoinedPage[] = [];
  for (let start = 0; start < ligs.length; start += PER_PAGE) {
    const cells = ligs.slice(start, start + PER_PAGE).map((l, i) => {
      const r = Math.floor(i / COLS), c = i % COLS;
      return {
        id: l.id, cp: l.sequence, kind: "letter" as const,
        x: GX + (COLS - 1 - c) * CELL_W, y: GY + r * CELL_H, w: CELL_W, h: CELL_H,
        label: sequenceText(l.sequence), code: `joined ${start + i + 1}`,
      };
    });
    pages.push({ id: FIRST_PAGE_ID + pages.length, title: "Joined letters", cells });
  }
  return pages;
}

/** The template layout with the joined-letter pages added, so a photo of one reads like any other sheet. */
export function withJoined(ligs: Ligature[]): Layout {
  return { ...layout, sheets: [...layout.sheets, ...joinedPages(ligs)] };
}
