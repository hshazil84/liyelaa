import type { Glyph } from "./types";

/** Letter combinations drawn as one shape, and how they are used. */
export type When = "always" | "start" | "end";
export type Ligature = {
  id: string;               // "lig1", "lig2", ... also the id of its glyph
  sequence: number[];       // code points in the order they are typed
  when: When;               // anywhere, or only at the start or the end of a word
  glyph: Glyph;             // the drawing; its id is the same as above
};

/** Choices about the signs and punctuation in the font. */
export type Extras = {
  latinPunctuation: boolean;   // typing , ; ? on a keyboard gives the Thaana-style ، ؛ ؟
  rtlQuotes: boolean;          // quote marks swap sides in right-to-left text
  rufiyaaPrivateUse: boolean;  // also keep the rufiyaa at a spare slot, for software that does not know it yet
};

export const DEFAULT_EXTRAS: Extras = { latinPunctuation: true, rtlQuotes: true, rufiyaaPrivateUse: false };

export const WHEN_LABEL: Record<When, string> = {
  always: "Anywhere in a word",
  start: "Only at the start of a word",
  end: "Only at the end of a word",
};

const LATIN: Record<number, number> = { 0x2c: 0x060c, 0x3b: 0x061b, 0x3f: 0x061f };
const SWAP: Record<number, number> = { 0x201c: 0x201d, 0x201d: 0x201c, 0x2018: 0x2019, 0x2019: 0x2018 };

/** What the built font shows for typed text, so a preview matches the download. */
export function shownText(text: string, ex: Extras): string {
  return Array.from(text).map((ch) => {
    const cp = ch.codePointAt(0)!;
    if (ex.latinPunctuation && LATIN[cp]) return String.fromCodePoint(LATIN[cp]);
    if (ex.rtlQuotes && SWAP[cp]) return String.fromCodePoint(SWAP[cp]);
    return ch;
  }).join("");
}

export type SymbolGroup = { title: string; note: string; items: { id: string; name: string }[] };

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    title: "Signs",
    note: "Whole signs drawn as one shape.",
    items: [{ id: "FDFD", name: "Bismillah" }, { id: "FDF2", name: "Allah" }, { id: "20C2", name: "Rufiyaa" }],
  },
  {
    title: "Punctuation",
    note: "Thaana uses its own comma, semicolon and question mark.",
    items: [
      { id: "060C", name: "Comma" }, { id: "061B", name: "Semicolon" }, { id: "061F", name: "Question mark" },
      { id: "002E", name: "Full stop" }, { id: "0021", name: "Exclamation mark" }, { id: "003A", name: "Colon" },
    ],
  },
  {
    title: "Quotes and brackets",
    note: "Drawn the way they look in left-to-right text.",
    items: [
      { id: "201C", name: "Double quote, open" }, { id: "201D", name: "Double quote, close" },
      { id: "2018", name: "Single quote, open" }, { id: "2019", name: "Single quote, close" },
      { id: "00AB", name: "Angle quote «" }, { id: "00BB", name: "Angle quote »" },
      { id: "0028", name: "Bracket (" }, { id: "0029", name: "Bracket )" },
    ],
  },
];

/** The next free ligature id. */
export function nextLigatureId(ligs: Ligature[]): string {
  const n = ligs.reduce((m, l) => Math.max(m, Number(l.id.replace(/\D/g, "")) || 0), 0);
  return `lig${n + 1}`;
}

export const sequenceText = (seq: number[]) => String.fromCodePoint(...seq);
