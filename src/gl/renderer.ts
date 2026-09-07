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
import { BLUR_FS, VERT, VIEW_FS, buildHeightFS } from "./shaders";
import { BLIT_FS, LENS_FS, THICKNESS_FS } from "../glass/objectShaders";
import { MaskPair } from "../glass/mask";
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
  private blit: Prog;
  private thickness: Prog;
  private lens: Prog;
  private hA: Target;
  private hB: Target;
  private out: Target;
  private thickT: Target;
  private thickTmp: Target;
  private thickB: Target;
  private bdSmall: Target;
  private bdSmallTmp: Target;
  private backdropTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private maskSoftTex: WebGLTexture | null = null;
  private bdW = 1600;
  private bdH = 1000;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = createContext(canvas);
    this.gl = gl;
    this.quad = createQuad(gl);
    this.blur = this.makeProg(BLUR_FS);
    this.view = this.makeProg(VIEW_FS);
    this.blit = this.makeProg(BLIT_FS);
    this.thickness = this.makeProg(THICKNESS_FS);
    this.lens = this.makeProg(LENS_FS);
    this.hA = createHeightTarget(gl);
    this.hB = createHeightTarget(gl);
    this.out = createByteTarget(gl);
    this.thickT = createHeightTarget(gl);
    this.thickTmp = createHeightTarget(gl);
    this.thickB = createHeightTarget(gl);
    this.bdSmall = createByteTarget(gl);
    this.bdSmallTmp = createByteTarget(gl);
  }

  get backdropSize(): { width: number; height: number } {
    return { width: this.bdW, height: this.bdH };
  }

  setBackdrop(source: TexImageSource, width: number, height: number): void {
    if (this.backdropTex) this.gl.deleteTexture(this.backdropTex);
    this.backdropTex = createImageTexture(this.gl, source);
    this.bdW = width;
    this.bdH = height;
  }

  setMask(pair: MaskPair | null): void {
    const gl = this.gl;
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    if (this.maskSoftTex) gl.deleteTexture(this.maskSoftTex);
    this.maskTex = pair ? createImageTexture(gl, pair.crisp) : null;
    this.maskSoftTex = pair ? createImageTexture(gl, pair.soft) : null;
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

  private drawQuad(): void {
    this.gl.bindVertexArray(this.quad);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  /** Renders the pattern, its levels and the softening blur into hA. */
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
    return this.hA;
  }

  private blitView(source: Target, repeat: number, guides: boolean): void {
    const gl = this.gl;
    gl.useProgram(this.view.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    this.view.u.i("u_src", 0);
    this.view.u.f("u_repeat", repeat);
    this.view.u.f("u_guides", guides ? 1 : 0);
    this.drawQuad();
  }

  /** Draws the map to the visible canvas, optionally tiled to check seams. */
  render(state: State): void {
    const gl = this.gl;
    const height = this.renderHeight(state, state.textureSize);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.blitView(height, state.repeat, state.guides);
  }

  /** One tile at export resolution, as 8-bit RGBA (grayscale). */
  readTexture(state: State, size: number): Pixels {
    const s = Math.min(size, this.maxTextureSize);
    const height = this.renderHeight(state, s);
    this.out.resize(s, s);
    this.out.bind();
    // Always a single, un-annotated tile — never the tiled preview.
    this.blitView(height, 1, false);
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

  /** Two-pass separable blur from `src` into `dst`, using `tmp` as scratch. */
  private blurInto(src: Target, tmp: Target, dst: Target, radius: number): void {
    const gl = this.gl;
    gl.useProgram(this.blur.prog);
    this.blur.u.i("u_src", 0);
    this.blur.u.f("u_radius", Math.min(radius, 24));
    gl.activeTexture(gl.TEXTURE0);

    tmp.bind();
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    this.blur.u.v2("u_dir", 1 / Math.max(1, src.width), 0);
    this.drawQuad();

    dst.bind();
    gl.bindTexture(gl.TEXTURE_2D, tmp.texture);
    this.blur.u.v2("u_dir", 0, 1 / Math.max(1, tmp.height));
    this.drawQuad();
  }

  /**
   * Thickness -> shadow blur -> downsampled backdrop blur -> lens composite.
   * `toScreen` false renders into the export target instead.
   */
  private renderObjectTo(state: State, width: number, height: number, toScreen: boolean): void {
    const gl = this.gl;
    const o = state.object;

    // Optional surface texture riding on the shape.
    if (o.patternAmt > 0.001) this.renderHeight(state, state.textureSize);

    this.thickT.resize(width, height);
    this.thickTmp.resize(width, height);
    this.thickB.resize(width, height);

    this.thickT.bind();
    gl.useProgram(this.thickness.prog);
    const tu = this.thickness.u;
    tu.i("u_shape", o.shape);
    tu.v2("u_center", o.centerX, o.centerY);
    tu.v2("u_size", o.sizeX, o.sizeY);
    tu.f("u_radius", o.radius);
    tu.f("u_rotation", o.rotation);
    tu.f("u_aspect", width / Math.max(1, height));
    tu.f("u_edge", o.edge);
    tu.f("u_profile", o.profile);
    tu.f("u_patternAmt", o.patternAmt);
    tu.f("u_patternScale", o.patternScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    tu.i("u_mask", 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskSoftTex);
    tu.i("u_maskSoft", 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.hA.texture);
    tu.i("u_pattern", 2);
    this.drawQuad();

    if (o.shadow > 0.001) {
      this.blurInto(this.thickT, this.thickTmp, this.thickB, 16);
    }

    // Blurring a quarter-size copy buys a much wider frost than 24 taps alone.
    const sw = Math.max(1, Math.round(width / 4));
    const sh = Math.max(1, Math.round(height / 4));
    this.bdSmall.resize(sw, sh);
    this.bdSmallTmp.resize(sw, sh);
    // Always built: the lens pass also uses it to prefilter strong refraction.
    this.bdSmall.bind();
    gl.useProgram(this.blit.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.backdropTex);
    this.blit.u.i("u_src", 0);
    this.drawQuad();
    this.blurInto(this.bdSmall, this.bdSmallTmp, this.bdSmall, 14);

    if (toScreen) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
    } else {
      this.out.resize(width, height);
      this.out.bind();
    }

    gl.useProgram(this.lens.prog);
    const lu = this.lens.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.backdropTex);
    lu.i("u_backdrop", 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bdSmall.texture);
    lu.i("u_backdropBlur", 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.thickT.texture);
    lu.i("u_thick", 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.thickB.texture);
    lu.i("u_thickBlur", 3);
    lu.v2("u_res", width, height);
    lu.f("u_edge", o.edge);
    lu.f("u_refract", o.refract);
    lu.f("u_disperse", o.disperse);
    lu.f("u_frost", o.frost);
    lu.f("u_tintAmt", o.tintAmt);
    const [r, g, b] = hexToRgb(o.tintColor);
    lu.v3("u_tintColor", r, g, b);
    lu.f("u_spec", o.spec);
    lu.f("u_specWidth", o.specWidth);
    lu.f("u_light", o.light);
    lu.f("u_bump", o.bump);
    lu.f("u_innerGlow", o.innerGlow);
    lu.f("u_shadow", o.shadow);
    lu.v2("u_shadowOffset", o.shadowX, o.shadowY);
    this.drawQuad();
    gl.activeTexture(gl.TEXTURE0);
  }

  renderObject(state: State): void {
    this.renderObjectTo(state, this.canvas.width, this.canvas.height, true);
  }

  /** The composite at the backdrop's own resolution. */
  readObject(state: State): Pixels {
    const max = this.maxTextureSize;
    const w = Math.min(this.bdW, max);
    const h = Math.min(this.bdH, max);
    this.renderObjectTo(state, w, h, false);
    return this.readTarget(this.out);
  }

  resizeCanvas(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}
