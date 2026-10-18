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
```

Config (see `.env.example`): `NEXT_PUBLIC_BUILDER_URL` for the web app, `ALLOWED_ORIGINS` for the builder.

## Status

| Path | State |
| --- | --- |
| Play with a font (weight, width, slant, spacing) | Done. Live preview matches the built font. |
| Make a font from handwriting | Next. Proofs done: template, photo to outlines in the browser, outlines to a valid TTF. |
| Draw or import (pen tool, SVG) | After handwriting; shares its editor. |
| Ligatures, RTL punctuation, mark anchors, Bismillah / Allah / rufiyaa | Proven in `builder` prototypes; to be wired into the handwriting build. |
| Login (Google, Microsoft) and cloud save | Later. Everything is local-first, so login only adds sync. |

Not built yet, so not shown in the UI: roundness and tail stamps.

## Licences

- Base font: Noto Sans Thaana, SIL Open Font License 1.1 (`builder/assets/OFL-NotoSansThaana.txt`). Fonts made from it keep that licence and get their own name. Every download includes `OFL.txt`.
- Do not ship potrace (GPL-2.0) in the browser. For tracing use d3-contour (ISC) and paper.js (MIT).
- Base font: Sangu Suruhee, SIL Open Font License 1.1, by Thaana Type Foundry (`builder/assets/OFL-SanguSuruhee.txt`). It has one weight, so Play thins or thickens the outlines. Downloads include its own `OFL.txt`.
- AK Rasmee (Dhivehi Type Foundry, All Rights Reserved) is used only as the site's Thaana UI font and for the grey reference letters printed on the handwriting template (`web/public/fonts/AKRasmee-2.0.woff2`). It is not a Play base, so it is never inside a downloaded font. Used with the rights holder's consent. This repository (`hshazil84/liyelaa`) is currently public, so that font file is publicly downloadable; make the repo private or remove the file if that is not intended.
