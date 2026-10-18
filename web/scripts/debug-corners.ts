// Run the corner finder on a photo from the command line:  npx tsx scripts/debug-corners.ts photo.jpg
import { readFileSync } from "fs";
import jpeg from "jpeg-js";
import { findMarks } from "../lib/handwriting/corners";

const raw = jpeg.decode(readFileSync(process.argv[2]), { useTArray: true });
const img = { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) } as unknown as ImageData;
const t = performance.now();
const r = findMarks(img);
console.log(process.argv[2], `${raw.width}x${raw.height}`, `${(performance.now() - t).toFixed(0)} ms`);
console.log(JSON.stringify(r.ok ? r.pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) : r));
