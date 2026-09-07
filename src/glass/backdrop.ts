/**
 * Default backdrop so the glass has something to bend before you drop your own
 * image in. Mixes flat fields, hairlines and heavy type — the three things that
 * make a refraction legible.
 */
export function makeBackdrop(width = 1600, height = 1000): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d")!;

  const bg = c.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0d1730");
  bg.addColorStop(0.4, "#3a2a6b");
  bg.addColorStop(0.72, "#c2506a");
  bg.addColorStop(1, "#f0a94e");
  c.fillStyle = bg;
  c.fillRect(0, 0, width, height);

  c.save();
  c.globalCompositeOperation = "screen";
  const glow = c.createRadialGradient(width * 0.78, height * 0.24, 0, width * 0.78, height * 0.24, height * 0.7);
  glow.addColorStop(0, "rgba(255,228,170,0.8)");
  glow.addColorStop(1, "rgba(255,228,170,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, width, height);
  c.restore();

  c.strokeStyle = "rgba(255,255,255,0.22)";
  c.lineWidth = Math.max(1, height / 900);
  for (let y = height * 0.06; y < height * 0.96; y += height / 42) {
    c.beginPath();
    c.moveTo(width * 0.04, y);
    c.lineTo(width * 0.96, y);
    c.stroke();
  }

  c.fillStyle = "rgba(255,255,255,0.12)";
  for (const [cx, cy, r] of [
    [width * 0.2, height * 0.72, height * 0.22],
    [width * 0.86, height * 0.78, height * 0.14],
  ]) {
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
  }

  c.fillStyle = "#fffaf2";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `700 ${Math.round(height * 0.2)}px Georgia, "Times New Roman", serif`;
  c.fillText("BACKDROP", width / 2, height * 0.42);

  c.font = `500 ${Math.round(height * 0.028)}px ui-sans-serif, system-ui, sans-serif`;
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.fillText("DROP AN IMAGE ANYWHERE  ·  OR PASTE ONE", width / 2, height * 0.56);

  return canvas;
}
