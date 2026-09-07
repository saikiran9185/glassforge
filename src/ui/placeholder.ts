/**
 * A stand-in image so the app is useful before you drop anything in.
 * Deliberately mixes flat fields, hairlines and heavy type — those are the
 * three things that make a refraction read.
 */
export function makePlaceholder(width = 1400, height = 900): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d")!;

  const bg = c.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#101a2e");
  bg.addColorStop(0.45, "#2c3f6b");
  bg.addColorStop(0.75, "#c8603f");
  bg.addColorStop(1, "#f2c14e");
  c.fillStyle = bg;
  c.fillRect(0, 0, width, height);

  c.save();
  c.globalCompositeOperation = "screen";
  const glow = c.createRadialGradient(width * 0.72, height * 0.3, 0, width * 0.72, height * 0.3, height * 0.6);
  glow.addColorStop(0, "rgba(255,236,190,0.85)");
  glow.addColorStop(1, "rgba(255,236,190,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, width, height);
  c.restore();

  // Hairlines — the first thing to break up under distortion.
  c.strokeStyle = "rgba(255,255,255,0.28)";
  c.lineWidth = 1;
  for (let y = height * 0.08; y < height * 0.94; y += 18) {
    c.beginPath();
    c.moveTo(width * 0.06, y);
    c.lineTo(width * 0.94, y);
    c.stroke();
  }

  c.fillStyle = "rgba(255,255,255,0.14)";
  for (const [cx, cy, r] of [
    [width * 0.24, height * 0.7, height * 0.2],
    [width * 0.82, height * 0.74, height * 0.13],
    [width * 0.6, height * 0.22, height * 0.1],
  ]) {
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
  }

  c.fillStyle = "#fdfbf7";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `700 ${Math.round(height * 0.26)}px "Times New Roman", Georgia, serif`;
  c.fillText("GLASS", width / 2, height * 0.47);

  c.font = `500 ${Math.round(height * 0.032)}px ui-sans-serif, system-ui, sans-serif`;
  c.fillStyle = "rgba(255,255,255,0.82)";
  c.fillText("DROP AN IMAGE ANYWHERE  ·  OR PASTE ONE", width / 2, height * 0.63);

  return canvas;
}
