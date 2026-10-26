export interface IcoImage {
  /** Width and height in pixels, from 1 to 256. */
  size: number;
  /** A PNG file of that size. */
  png: Uint8Array;
}

/**
 * Wraps PNG images in an ICO container. Every browser and Windows since Vista reads PNG
 * payloads, so no bitmap conversion is needed.
 */
export function buildIco(images: readonly IcoImage[]): Uint8Array {
  if (images.length === 0) {
    throw new RangeError('An ICO file needs at least one image.');
  }
  const headerSize = 6 + 16 * images.length;
  const total = images.reduce((sum, image) => sum + image.png.length, headerSize);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = headerSize;
  images.forEach((image, index) => {
    if (image.size < 1 || image.size > 256) {
      throw new RangeError(`ICO image size must be 1 to 256, received ${image.size}.`);
    }
    const entry = 6 + 16 * index;
    // A stored size of 0 means 256.
    view.setUint8(entry, image.size === 256 ? 0 : image.size);
    view.setUint8(entry + 1, image.size === 256 ? 0 : image.size);
    view.setUint8(entry + 2, 0); // palette colors
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // color planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, image.png.length, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(image.png, offset);
    offset += image.png.length;
  });
  return bytes;
}
