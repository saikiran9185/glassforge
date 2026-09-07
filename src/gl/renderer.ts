import {
  Target,
  Uniforms,
  createByteTarget,
  createContext,
  createHeightTarget,
  createProgram,
  createQuad,
} from "./core";
import { BLUR_FS, VERT, VIEW_FS, buildHeightFS } from "./shaders";
import { patternById } from "../patterns/registry";
import { State } from "../state";

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
  private hA: Target;
  private hB: Target;
  private out: Target;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = createContext(canvas);
    this.gl = gl;
    this.quad = createQuad(gl);
    this.blur = this.makeProg(BLUR_FS);
    this.view = this.makeProg(VIEW_FS);
    this.hA = createHeightTarget(gl);
    this.hB = createHeightTarget(gl);
    this.out = createByteTarget(gl);
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

  resizeCanvas(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}
