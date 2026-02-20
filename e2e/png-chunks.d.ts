declare module "png-chunks-extract" {
  function extractChunks(
    data: Uint8Array,
  ): Array<{ name: string; data: Uint8Array }>;
  export default extractChunks;
}

declare module "png-chunk-text" {
  function encode(keyword: string, text: string): { name: string; data: Uint8Array };
  function decode(data: Uint8Array): { keyword: string; text: string };
  export default { encode, decode };
}
