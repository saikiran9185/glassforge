import {
  Target,
  Uniforms,
  createByteTarget,
  createContext,
  createHeightTarget,
  createImageTexture,
  createProgram,
  createQuad,
} from "./core";
import { BLUR_FS, GLASS_FS, GRAD_FS, VERT, VIEW_FS, buildHeightFS } from "./shaders";
import { patternById } from "../patterns/registry";
import { State, hexToRgb } from "../state";

interface Prog {
  prog: WebGLProgram;
  u: Uniforms;
}

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, top row first (already flipped out of GL's bottom-up order). */
  data: Uint8ClampedArray<ArrayBuffer>;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private quad: WebGLVertexArrayObject;
  private heightProgs = new Map<string, Prog>();
  private blur: Prog;
  private view: Prog;
  private grad: Prog;
  private glass: Prog;
  private hA: Target;
  private hB: Target;
  private gradT: Target;
  private out: Target;
  private imgTex: WebGLTexture | null = null;
  private imgW = 1;
  private imgH = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = createContext(canvas);
    this.gl = gl;
    this.quad = createQuad(gl);
    this.blur = this.makeProg(BLUR_FS);
    this.view = this.makeProg(VIEW_FS);
    this.grad = this.makeProg(GRAD_FS);
    this.glass = this.makeProg(GLASS_FS);
    this.hA = createHeightTarget(gl);
    this.hB = createHeightTarget(gl);
    this.gradT = createByteTarget(gl, true);
    this.out = createByteTarget(gl);
  }

  get imageSize(): { width: number; height: number } {
    return { width: this.imgW, height: this.imgH };
  }

  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  private makeProg(fs: string): Prog {
    const prog = createProgram(this.gl, VERT, fs);
    return { prog, u: new Uniforms(this.gl, prog) };
  }

  private heightProg(patternId: string): Prog {
    let p = this.heightProgs.get(patternId);
    if (!p) {
      p = this.makeProg(buildHeightFS(patternById(patternId)));
      this.heightProgs.set(patternId, p);
    }
    return p;
  }

  setImage(source: TexImageSource, width: number, height: number): void {
    const gl = this.gl;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    this.imgTex = createImageTexture(gl, source);
    this.imgW = width;
    this.imgH = height;
  }

  private drawQuad(): void {
    this.gl.bindVertexArray(this.quad);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  /** Renders the pattern (plus levels and blur) into hA and returns it. */
  private renderHeight(state: State, size: number): Target {
    const gl = this.gl;
    const s = Math.min(size, this.maxTextureSize);
    this.hA.resize(s, s);
    this.hB.resize(s, s);

    const pattern = patternById(state.patternId);
    const { prog, u } = this.heightProg(state.patternId);
    this.hA.bind();
    gl.useProgram(prog);
    u.f("u_seed", state.seed);
    u.f("u_period", 1);
    u.f("u_contrast", state.height.contrast);
    u.f("u_brightness", state.height.brightness);
    u.f("u_invert", state.height.invert);
    const vals = state.params[pattern.id] ?? {};
    for (const def of pattern.params) {
      u.f(`u_${def.key}`, vals[def.key] ?? def.value);
    }
    this.drawQuad();

    const radius = state.height.blur;
    if (radius >= 0.01) {
      gl.useProgram(this.blur.prog);
      this.blur.u.i("u_src", 0);
      this.blur.u.f("u_radius", Math.min(radius, 24));
      gl.activeTexture(gl.TEXTURE0);

      this.hB.bind();
      gl.bindTexture(gl.TEXTURE_2D, this.hA.texture);
      this.blur.u.v2("u_dir", 1 / s, 0);
      this.drawQuad();

      this.hA.bind();
      gl.bindTexture(gl.TEXTURE_2D, this.hB.texture);
      this.blur.u.v2("u_dir", 0, 1 / s);
      this.drawQuad();
    }

    // Slope statistics for the glass pass, averaged down to 1x1 by the mip chain.
    this.gradT.resize(s, s);
    this.gradT.bind();
    gl.useProgram(this.grad.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hA.texture);
    this.grad.u.i("u_src", 0);
    this.grad.u.v2("u_texel", 1 / s, 1 / s);
    this.drawQuad();
    this.gradT.generateMips();

    return this.hA;
  }

  /** Binds the glass program and uploads everything except the render target. */
  private setupGlass(state: State, height: Target, width: number, hgt: number): void {
    const gl = this.gl;
    const { u, prog } = this.glass;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    u.i("u_img", 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, height.texture);
    u.i("u_height", 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.gradT.texture);
    u.i("u_grad", 2);

    const g = state.glass;
    // Scaling by the image aspect keeps the pattern's own cells square rather
    // than stretching them to the canvas.
    const aspect = width / Math.max(1, hgt);
    u.v2("u_imgSize", width, hgt);
    u.v2("u_tile", g.scale * aspect, g.scale);
    u.v2("u_offset", g.offsetX, g.offsetY);
    u.f("u_rotate", g.rotate);
    u.f("u_distort", g.distort);
    u.f("u_chroma", g.chroma);
    u.f("u_frost", g.frost);
    u.f("u_spec", g.spec);
    u.f("u_relief", g.relief);
    u.f("u_lightAngle", g.lightAngle);
    u.f("u_tint", g.tint);
    const [r, gg, b] = hexToRgb(g.tintColor);
    u.v3("u_tintColor", r, gg, b);

    const rv = state.reveal;
    u.i("u_reveal", rv.mode);
    u.v2("u_revealPos", rv.x, rv.y);
    u.f("u_revealSize", rv.size);
    u.f("u_revealFeather", rv.feather);
    u.f("u_revealAngle", rv.angle);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Draws to the visible canvas. `view` picks the refracted image or the raw tile. */
  render(state: State, view: "result" | "texture"): void {
    const gl = this.gl;
    const height = this.renderHeight(state, state.textureSize);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    if (view === "texture" || !this.imgTex) {
      gl.useProgram(this.view.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, height.texture);
      this.view.u.i("u_src", 0);
      this.drawQuad();
      return;
    }

    this.setupGlass(state, height, this.canvas.width, this.canvas.height);
    this.drawQuad();
  }

  /** Height map at export resolution, as 8-bit RGBA (grayscale). */
  readTexture(state: State, size: number): Pixels {
    const gl = this.gl;
    const s = Math.min(size, this.maxTextureSize);
    const height = this.renderHeight(state, s);
    this.out.resize(s, s);
    this.out.bind();
    gl.useProgram(this.view.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, height.texture);
    this.view.u.i("u_src", 0);
    this.drawQuad();
    return this.readTarget(this.out);
  }

  /** The refracted image at its native resolution. */
  readResult(state: State): Pixels {
    if (!this.imgTex) throw new Error("No image loaded.");
    const max = this.maxTextureSize;
    const w = Math.min(this.imgW, max);
    const h = Math.min(this.imgH, max);
    const height = this.renderHeight(state, state.textureSize);
    this.out.resize(w, h);
    this.out.bind();
    this.setupGlass(state, height, w, h);
    this.drawQuad();
    return this.readTarget(this.out);
  }

  private readTarget(target: Target): Pixels {
    const gl = this.gl;
    const { width, height } = target;
    const raw = new Uint8ClampedArray(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // GL hands back rows bottom-up; images and PSD both want top-down.
    const data = new Uint8ClampedArray(raw.length);
    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * stride;
      data.set(raw.subarray(src, src + stride), y * stride);
    }
    return { width, height, data };
  }

  resizeCanvas(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}
