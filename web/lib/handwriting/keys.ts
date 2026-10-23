/** Which key types each character on the standard Thaana phonetic keyboard (the Dhivehi layout on Windows, Mac and Linux). */
const ROWS: { keys: string; plain: (number | string)[]; shift: (number | string)[] }[] = [
  { keys: "qwertyuiop", plain: [0x7b0, 0x787, 0x7ac, 0x783, 0x78c, 0x794, 0x7aa, 0x7a8, 0x7ae, 0x795], shift: [0x7a4, 0x7a2, 0x7ad, 0x79c, 0x793, 0x7a0, 0x7ab, 0x7a9, 0x7af, "÷"] },
  { keys: "asdfghjkl", plain: [0x7a6, 0x790, 0x78b, 0x78a, 0x78e, 0x780, 0x796, 0x786, 0x78d], shift: [0x7a7, 0x781, 0x791, 0xfdf2, 0x7a3, 0x799, 0x79b, 0x79a, 0x785] },
  { keys: "zxcvbnm", plain: [0x792, "×", 0x797, 0x788, 0x784, 0x782, 0x789], shift: [0x7a1, 0x798, 0x79d, 0x7a5, 0x79e, 0x78f, 0x79f] },
];

export type KeyHint = { shift: boolean; key: string };

const MAP: Record<number, KeyHint> = {};
for (const r of ROWS) {
  Array.from(r.keys).forEach((k, i) => {
    const p = r.plain[i], s = r.shift[i];
    if (typeof p === "number") MAP[p] = { shift: false, key: k.toUpperCase() };
    if (typeof s === "number") MAP[s] = { shift: true, key: k.toUpperCase() };
  });
}
// punctuation and digits that sit on the same keyboard
Object.assign(MAP, {
  0x60c: { shift: false, key: "," }, 0x61f: { shift: true, key: "/" },
  0x28: { shift: true, key: "9" }, 0x29: { shift: true, key: "0" }, 0x21: { shift: true, key: "1" }, 0x2e: { shift: false, key: "." }, 0x3a: { shift: true, key: ";" },
});
for (let d = 0; d <= 9; d++) MAP[0x30 + d] = { shift: false, key: String(d) };

export function keyFor(cp: number): KeyHint | null {
  return MAP[cp] ?? null;
}
