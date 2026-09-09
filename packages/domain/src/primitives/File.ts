import { Schema } from "effect";

export const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export const MediaType = Schema.Literals([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export type MediaType = Schema.Schema.Type<typeof MediaType>;

export const Pdf = Schema.Struct({
  mediaType: Schema.Literal("application/pdf"),
  data: Schema.Uint8Array,
}).annotate({ identifier: "File.Pdf" });
export type Pdf = Schema.Schema.Type<typeof Pdf>;

export const Image = Schema.Struct({
  mediaType: Schema.Literals(["image/jpeg", "image/png", "image/webp"]),
  data: Schema.Uint8Array,
}).annotate({ identifier: "File.Image" });
export type Image = Schema.Schema.Type<typeof Image>;

export const File = Schema.Union([Pdf, Image]).annotate({ identifier: "File" });
export type File = Schema.Schema.Type<typeof File>;

const startsWith = (data: Uint8Array, signature: ReadonlyArray<number>) =>
  signature.every((byte, index) => data[index] === byte);

export const hasValidContent = (file: File): boolean => {
  if (file.data.byteLength === 0 || file.data.byteLength > MAX_SIZE_BYTES) return false;
  switch (file.mediaType) {
    case "application/pdf":
      return startsWith(file.data, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "image/jpeg":
      return startsWith(file.data, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(file.data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        startsWith(file.data, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(file.data.slice(8), [0x57, 0x45, 0x42, 0x50])
      );
  }
};
