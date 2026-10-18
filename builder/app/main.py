"""Font builder API. Stateless: nothing is stored, every request returns a finished font."""
import asyncio
import os
import re
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from fontmaker.play import PlayParams, build_play_font, build_zip, font_bytes

ALLOWED = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app = FastAPI(title="Dhivehi Font Maker builder", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED, allow_methods=["POST", "GET"], allow_headers=["content-type"],
                   expose_headers=["content-disposition"])

# At most a few builds at once, so a burst of requests cannot exhaust the server.
_slots = asyncio.Semaphore(int(os.environ.get("MAX_CONCURRENT_BUILDS", "4")))


class PlayRequest(BaseModel):
    weight: int = Field(400, ge=100, le=900)
    width: int = Field(100, ge=70, le=140)
    slant: float = Field(0, ge=-15, le=15)
    spacing: int = Field(0, ge=-100, le=200)
    name: str = Field("My Dhivehi Font", max_length=60)
    base: Literal["noto", "sangu"] = "noto"
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
