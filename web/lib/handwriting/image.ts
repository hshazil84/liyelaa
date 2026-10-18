/** Read a photo file into pixels, respecting the phone's rotation flag and capping the size. */
export async function loadImage(file: Blob, maxSide = 3200): Promise<ImageData> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

export function lum(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

export function imageDataToUrl(img: ImageData, maxW = 900): string {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  const s = Math.min(1, maxW / img.width);
  const o = document.createElement("canvas");
  o.width = Math.round(img.width * s); o.height = Math.round(img.height * s);
  o.getContext("2d")!.drawImage(c, 0, 0, o.width, o.height);
  return o.toDataURL("image/jpeg", 0.85);
}
