import { Pixels } from "../gl/renderer";
import { downloadBlob } from "./download";

/**
 * Writes a flattened 8-bit grayscale PSD.
 *
 * Photoshop's Filter > Distort > Glass "Load Texture" only reads a PSD, and it
 * only cares about luminance, so a single-channel uncompressed document is
 * exactly what it wants — and it stays a file you can open and paint on.
 *
 * Layout (Adobe's spec, big-endian throughout):
 *   header -> colour mode data -> image resources -> layer/mask info -> image data
 */
export function encodeGrayscalePSD(px: Pixels): Blob {
  const { width, height, data } = px;
  if (width > 30000 || height > 30000) {
    throw new Error("PSD dimensions are capped at 30000 px.");
  }

  const HEADER = 26;
  const SECTIONS = 12; // three empty length fields
  const COMPRESSION = 2;
  const pixels = width * height;
  const buf = new ArrayBuffer(HEADER + SECTIONS + COMPRESSION + pixels);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let o = 0;

  // -- File header -----------------------------------------------------------
  bytes.set([0x38, 0x42, 0x50, 0x53], o); o += 4;  // '8BPS'
  view.setUint16(o, 1); o += 2;                    // version 1
  o += 6;                                          // reserved, must be zero
  view.setUint16(o, 1); o += 2;                    // channel count
  view.setUint32(o, height); o += 4;
  view.setUint32(o, width); o += 4;
  view.setUint16(o, 8); o += 2;                    // bits per channel
  view.setUint16(o, 1); o += 2;                    // colour mode: 1 = grayscale

  // -- Empty sections --------------------------------------------------------
  view.setUint32(o, 0); o += 4;                    // colour mode data
  view.setUint32(o, 0); o += 4;                    // image resources
  view.setUint32(o, 0); o += 4;                    // layer and mask info

  // -- Image data ------------------------------------------------------------
  view.setUint16(o, 0); o += 2;                    // compression: 0 = raw
  for (let i = 0; i < pixels; i++) bytes[o + i] = data[i * 4]; // red == luminance here

  return new Blob([buf], { type: "image/vnd.adobe.photoshop" });
}

export function downloadPSD(px: Pixels, filename: string): void {
  downloadBlob(encodeGrayscalePSD(px), filename);
}
