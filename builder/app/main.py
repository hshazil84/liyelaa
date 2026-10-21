"""Font builder API. Stateless: nothing is stored, every request returns a finished font."""
import asyncio
import os
import re
import time
from collections import defaultdict, deque
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from fontmaker.handwriting import BuildRequest, build_handwriting_font, build_zip as build_handwriting_zip
from fontmaker.play import PlayParams, build_play_font, build_zip, font_bytes

ALLOWED = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app = FastAPI(title="MyAkuru builder", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED, allow_methods=["POST", "GET"], allow_headers=["content-type"],
                   expose_headers=["content-disposition", "x-dfm-filled", "x-dfm-drawn"])

# Each visitor (by address) gets a limited number of builds a minute. Railway puts the real address in X-Forwarded-For.
RATE_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "20"))
_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.method == "POST" and RATE_PER_MIN > 0:
        who = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
        now = time.monotonic()
        q = _hits[who]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= RATE_PER_MIN:
            wait = max(1, int(60 - (now - q[0])))
            origin = request.headers.get("origin", "")
            headers = {"retry-after": str(wait)}
            if origin in ALLOWED:                    # this response skips the CORS layer, so the browser needs the header here
                headers["access-control-allow-origin"] = origin
            return JSONResponse({"detail": "Too many fonts built a minute. Wait a little and try again."}, status_code=429, headers=headers)
        q.append(now)
        if len(_hits) > 5000:                       # forget visitors that have gone quiet
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
                del _hits[k]
    return await call_next(request)


# At most a few builds at once, so a burst of requests cannot exhaust the server.
_slots = asyncio.Semaphore(int(os.environ.get("MAX_CONCURRENT_BUILDS", "4")))


class PlayRequest(BaseModel):
    weight: int = Field(400, ge=100, le=900)
    width: int = Field(100, ge=70, le=140)
    slant: float = Field(0, ge=-15, le=15)
    spacing: int = Field(0, ge=-100, le=200)
    name: str = Field("My Dhivehi Font", max_length=60)
    base: Literal["noto", "sangu", "haluvidhaa", "hawwa"] = "noto"
    format: Literal["zip", "ttf", "woff2"] = "zip"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/play/build")
async def play_build(req: PlayRequest):
    params = PlayParams(req.weight, req.width, req.slant, req.spacing, req.name, req.base).validated()
    slug = re.sub(r"[^A-Za-z0-9]+", "-", params.name).strip("-") or "font"
    async with _slots:
        try:
            if req.format == "zip":
                data, slug = await asyncio.to_thread(build_zip, params)
                media, filename = "application/zip", f"{slug}.zip"
            else:
                font = await asyncio.to_thread(build_play_font, params)
                data = await asyncio.to_thread(font_bytes, font, "woff2" if req.format == "woff2" else None)
                media = "font/woff2" if req.format == "woff2" else "font/ttf"
                filename = f"{slug}.{req.format}"
        except Exception as exc:  # pragma: no cover - surfaced to the client as a clean error
            raise HTTPException(status_code=500, detail="Could not build the font") from exc
    return Response(data, media_type=media, headers={"content-disposition": f'attachment; filename="{filename}"'})


class HandwritingBuild(BuildRequest):
    format: Literal["zip", "ttf", "woff2"] = "zip"


MAX_BODY = 8_000_000


@app.post("/handwriting/build")
async def handwriting_build(req: HandwritingBuild, request: Request):
    if int(request.headers.get("content-length") or 0) > MAX_BODY:
        raise HTTPException(status_code=413, detail="That project is too large to build")
    core = BuildRequest(**req.model_dump(exclude={"format"}))
    async with _slots:
        try:
            if req.format == "zip":
                data, slug, report = await asyncio.to_thread(build_handwriting_zip, core)
                media, filename = "application/zip", f"{slug}.zip"
            else:
                font, report = await asyncio.to_thread(build_handwriting_font, core)
                data = await asyncio.to_thread(font_bytes, font, "woff2" if req.format == "woff2" else None)
                slug = re.sub(r"[^A-Za-z0-9]+", "-", core.name).strip("-") or "font"
                media = "font/woff2" if req.format == "woff2" else "font/ttf"
                filename = f"{slug}.{req.format}"
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail="Could not build the font") from exc
    headers = {
        "content-disposition": f'attachment; filename="{filename}"',
        "x-dfm-filled": ",".join(report["filled_from_starter"]),
        "x-dfm-drawn": str(len(report["drawn"])),
    }
    return Response(data, media_type=media, headers=headers)
