// Diagnostic-only WebGL interception. Queries after draws intentionally synchronize;
// never enable this while measuring performance or in product code.
export function installWebGlDiagnostics() {
  window.__webglDiagnostics = [];
  for (const kind of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const proto = window[kind]?.prototype;
    if (!proto) continue;
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      if (!Object.hasOwn(proto, method)) continue;
      const original = proto[method];
      proto[method] = function (...args) {
        const result = Reflect.apply(original, this, args);
        if (window.__webglDiagnostics.length >= 20) return result;
        const error = this.getError();
        if (error === this.NO_ERROR) return result;
        const program = this.getParameter(this.CURRENT_PROGRAM);
        const active = this.getParameter(this.ACTIVE_TEXTURE);
        const uniforms = [];
        if (program) for (let i = 0, n = this.getProgramParameter(program, this.ACTIVE_UNIFORMS); i < n; i++) {
          const info = this.getActiveUniform(program, i);
          const targets = { [this.SAMPLER_2D]: this.TEXTURE_2D, [this.SAMPLER_CUBE]: this.TEXTURE_CUBE_MAP, [this.SAMPLER_2D_SHADOW]: this.TEXTURE_2D, [this.INT_SAMPLER_2D]: this.TEXTURE_2D, [this.UNSIGNED_INT_SAMPLER_2D]: this.TEXTURE_2D };
          const target = targets[info.type];
          if (!target) continue;
          const value = this.getUniform(program, this.getUniformLocation(program, info.name));
          const units = typeof value === 'number' ? [value] : [...value];
          uniforms.push({ name: info.name, type: info.type, units: units.map(unit => {
            this.activeTexture(this.TEXTURE0 + unit);
            return { unit, target, bound: !!this.getParameter(target === this.TEXTURE_2D ? this.TEXTURE_BINDING_2D : this.TEXTURE_BINDING_CUBE_MAP), compareMode: this.getTexParameter(target, this.TEXTURE_COMPARE_MODE), compareFunc: this.getTexParameter(target, this.TEXTURE_COMPARE_FUNC) };
          }) });
        }
        this.activeTexture(active);
        const shaders = program ? this.getAttachedShaders(program).map(shader => ({ type: this.getShaderParameter(shader, this.SHADER_TYPE), source: this.getShaderSource(shader) })) : [];
        window.__webglDiagnostics.push({ at: performance.now(), method, error, stack: new Error().stack, uniforms, shaders });
        return result;
      };
    }
  }
}
