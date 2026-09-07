export class GLError extends Error {}

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new GLError("WebGL2 is not available in this browser.");
  return gl;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "";
    gl.deleteShader(sh);
    throw new GLError(`Shader failed to compile:\n${log}\n${numberLines(src)}`);
  }
  return sh;
}

function numberLines(src: string): string {
  return src
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(4)} | ${l}`)
    .join("\n");
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "";
    gl.deleteProgram(prog);
    throw new GLError(`Program failed to link:\n${log}`);
  }
  return prog;
}

/** Caches uniform locations so the render loop isn't doing string lookups. */
export class Uniforms {
  private cache = new Map<string, WebGLUniformLocation | null>();
  constructor(private gl: WebGL2RenderingContext, private prog: WebGLProgram) {}

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.cache.has(name)) {
      this.cache.set(name, this.gl.getUniformLocation(this.prog, name));
    }
    return this.cache.get(name)!;
  }
  f(name: string, v: number) { const l = this.loc(name); if (l) this.gl.uniform1f(l, v); }
  i(name: string, v: number) { const l = this.loc(name); if (l) this.gl.uniform1i(l, v); }
  v2(name: string, x: number, y: number) { const l = this.loc(name); if (l) this.gl.uniform2f(l, x, y); }
  v3(name: string, x: number, y: number, z: number) { const l = this.loc(name); if (l) this.gl.uniform3f(l, x, y, z); }
}

/** One screen-filling triangle pair, shared by every pass. */
export function createQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

/** A render target that can be sampled. Repeat-wrapped so textures can tile. */
export class Target {
  readonly fbo: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  width = 0;
  height = 0;

  constructor(
    private gl: WebGL2RenderingContext,
    private internalFormat: number,
    private format: number,
    private type: number
  ) {
    this.fbo = gl.createFramebuffer()!;
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, width, height, 0, this.format, this.type, null);
  }

  bind(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  dispose(): void {
    this.gl.deleteFramebuffer(this.fbo);
    this.gl.deleteTexture(this.texture);
  }
}

/**
 * Half-float targets keep gradients smooth — 8-bit height maps band badly once
 * you take their derivative for refraction. Falls back if the extension is absent.
 */
export function createHeightTarget(gl: WebGL2RenderingContext): Target {
  if (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")) {
    return new Target(gl, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
  }
  return new Target(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
}

export function createByteTarget(gl: WebGL2RenderingContext): Target {
  return new Target(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
}

/** Uploads an image/canvas as a clamped, linearly filtered texture. */
export function createImageTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
