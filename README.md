# Dhivehi Font Maker

Make a Dhivehi (Thaana) font: restyle an open one, or build one from your own handwriting.
No account needed. Projects are kept in the user's own browser.

```
web/       Next.js 14 (App Router) + TypeScript + Tailwind. Deploy on Vercel, root directory `web`.
builder/   FastAPI + fontTools. Stateless: takes settings (later: outlines), returns a finished font. Deploy on Railway, root directory `builder`.
e2e/       Browser test of the full flow (Playwright).
```

## Run it

```bash
# 1. builder (port 8000)
cd builder && pip install -r requirements.txt && python3 -m uvicorn app.main:app --port 8000

# 2. web (port 3000)
cd web && npm install && npm run dev

# 3. tests
cd builder && python3 -m pytest          # font logic + API
python3 e2e/play_flow.py                 # browser flow, needs both servers running and `pip install playwright`
python3 e2e/synthetic_photo.py           # fake phone photos of the filled-in template, written to e2e/out
python3 e2e/handwriting_flow.py e2e/out  # photo page: finds the sheet, traces the letters
python3 e2e/letters_flow.py e2e/out      # clean-up editor: drag, add and delete points, pen, undo
python3 e2e/build_font_flow.py e2e/out   # traced letters -> builder -> font, rendered in the browser (needs the builder too)
cd web && npx tsx scripts/test-edit.ts   # outline editing maths
```

Config (see `.env.example`): `NEXT_PUBLIC_BUILDER_URL` for the web app, `ALLOWED_ORIGINS` for the builder.

## Status

| Path | State |
| --- | --- |
| Play with a font (weight, width, slant, spacing, two starting fonts) | Done. Live preview matches the built font. |
| Make a font from handwriting | In progress. Done: print template, photo to outlines in the browser, clean-up editor (move points, pen, eraser, undo). Builder endpoint `POST /handwriting/build` turns outlines into a font (clean outlines, mark attachment, ligatures, kerning, RTL quotes, starter-font fill). Next: anchors, spacing and test/export screens. |
| Draw or import (pen tool, SVG) | After handwriting; shares the clean-up editor (the pen already works there). |
| Ligatures, RTL punctuation, mark anchors, Bismillah / Allah / rufiyaa | Proven in `builder` prototypes; to be wired into the handwriting build. |
| Login (Google, Microsoft) and cloud save | Later. Everything is local-first, so login only adds sync. |

Not built yet, so not shown in the UI: roundness and tail stamps.

## Licences

- Base font: Noto Sans Thaana, SIL Open Font License 1.1 (`builder/assets/OFL-NotoSansThaana.txt`). Fonts made from it keep that licence and get their own name. Every download includes `OFL.txt`.
- Do not ship potrace (GPL-2.0) in the browser. For tracing use d3-contour (ISC) and paper.js (MIT).
- Base font: Sangu Suruhee, SIL Open Font License 1.1, by Thaana Type Foundry (`builder/assets/OFL-SanguSuruhee.txt`). It has one weight, so Play thins or thickens the outlines. Downloads include its own `OFL.txt`.
- AK Rasmee (Dhivehi Type Foundry, All Rights Reserved) is used only as the site's Thaana UI font and for the grey reference letters printed on the handwriting template (`web/public/fonts/AKRasmee-2.0.woff2`). It is not a Play base, so it is never inside a downloaded font. Used with the rights holder's consent. This repository (`hshazil84/liyelaa`) is currently public, so that font file is publicly downloadable; make the repo private or remove the file if that is not intended.
