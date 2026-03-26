declare module "png-chunks-extract" {
  function extractChunks(
    buf: Uint8Array,
  ): Array<{ name: string; data: Uint8Array }>;
  export default extractChunks;
}

declare module "png-chunks-encode" {
  function encodeChunks(
    chunks: Array<{ name: string; data: Uint8Array }>,
  ): Uint8Array;
  export default encodeChunks;
}

declare module "png-chunk-text" {
  function encode(
    keyword: string,
    text: string,
  ): { name: string; data: Uint8Array };
  function decode(data: Uint8Array): { keyword: string; text: string };
}
