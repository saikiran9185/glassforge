import { Pixels } from "../gl/renderer";
import { downloadBlob } from "./download";

export function pixelsToCanvas(px: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D context for export.");
  ctx.putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
  return canvas;
}

export async function downloadPNG(px: Pixels, filename: string): Promise<void> {
  const canvas = pixelsToCanvas(px);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("PNG encoding failed.");
  downloadBlob(blob, filename);
}
