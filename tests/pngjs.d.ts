// The subset of pngjs the tests and sprite build use (the package ships no types).
declare module 'pngjs' {
  interface Image { width: number; height: number; data: Buffer }
  class PNG implements Image {
    constructor(options: { width: number; height: number });
    width: number; height: number; data: Buffer;
    static sync: { read(buffer: Buffer): Image; write(png: Image): Buffer };
  }
  const pngjs: { PNG: typeof PNG };
  export default pngjs;
  export { PNG };
}
