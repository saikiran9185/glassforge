/**
 * Turns text or an uploaded image into the mask pair the thickness pass wants:
 * a crisp alpha for coverage and a blurred alpha that doubles as the thickness
 * ramp. Doing the blur here (rather than as a GPU pass) keeps the shader to one
 * code path and costs nothing — masks only change when you edit them.
 */
export interface MaskPair {
  crisp: HTMLCanvasElement;
  soft: HTMLCanvasElement;
}

export interface TextMaskOptions {
  width: number;
  height: number;
  text: string;
  fontFamily: string;
  fontWeight: number;
  /** Cap height as a fraction of canvas height. */
  fontSize: number;
  letterSpacing: number;
  centerX: number;
  centerY: number;
  rotation: number;
  /** Blur radius as a fraction of canvas height. */
  edge: number;
}

function blank(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D context for the mask.");
  return [canvas, ctx];
}

function drawText(ctx: CanvasRenderingContext2D, o: TextMaskOptions): void {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.translate(o.centerX * width, (1 - o.centerY) * height);
  ctx.rotate((-o.rotation * Math.PI) / 180);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // letterSpacing is recent but widely shipped; ignored where it isn't.
  try {
    ctx.letterSpacing = `${o.letterSpacing.toFixed(3)}em`;
  } catch {
    /* older engine — spacing just stays at zero */
  }
  ctx.font = `${o.fontWeight} ${Math.max(1, o.fontSize * height)}px ${o.fontFamily}`;
  for (const [i, line] of o.text.split("\n").entries()) {
    const lines = o.text.split("\n").length;
    const lh = o.fontSize * height * 1.05;
    ctx.fillText(line, 0, (i - (lines - 1) / 2) * lh);
  }
  ctx.restore();
}

export function buildTextMask(o: TextMaskOptions): MaskPair {
  const [crisp, cc] = blank(o.width, o.height);
  drawText(cc, o);

  const [soft, sc] = blank(o.width, o.height);
  sc.filter = `blur(${Math.max(0.5, o.edge * o.height).toFixed(2)}px)`;
  drawText(sc, o);

  return { crisp, soft };
}

export interface ImageMaskOptions {
  width: number;
  height: number;
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  /** "alpha" uses the file's transparency; "luma" turns brightness into shape. */
  channel: "alpha" | "luma";
  scale: number;
  centerX: number;
  centerY: number;
  rotation: number;
  edge: number;
}

function drawImageMask(ctx: CanvasRenderingContext2D, o: ImageMaskOptions): void {
  const { width, height } = ctx.canvas;
  const fit = Math.min(width / o.sourceWidth, height / o.sourceHeight) * o.scale;
  const w = o.sourceWidth * fit;
  const h = o.sourceHeight * fit;
  ctx.save();
  ctx.translate(o.centerX * width, (1 - o.centerY) * height);
  ctx.rotate((-o.rotation * Math.PI) / 180);
  ctx.drawImage(o.source, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Rewrites alpha from luminance, for opaque files like JPEGs. */
function lumaToAlpha(ctx: CanvasRenderingContext2D): void {
  const { width, height } = ctx.canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i + 3] = Math.round((d[i + 3] / 255) * luma);
  }
  ctx.putImageData(img, 0, 0);
}

export function buildImageMask(o: ImageMaskOptions): MaskPair {
  const [crisp, cc] = blank(o.width, o.height);
  drawImageMask(cc, o);
  if (o.channel === "luma") lumaToAlpha(cc);

  const [soft, sc] = blank(o.width, o.height);
  // Blurring a luma-derived mask needs the conversion first, so it is done on a
  // copy of the finished crisp mask rather than on the raw image.
  sc.filter = `blur(${Math.max(0.5, o.edge * o.height).toFixed(2)}px)`;
  sc.drawImage(crisp, 0, 0);

  return { crisp, soft };
}
