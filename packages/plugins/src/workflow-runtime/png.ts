import { inflateSync } from 'node:zlib';
/** Decode non-interlaced 8-bit RGB/RGBA PNG screenshots without native dependencies. */
export function decodePng(buffer: Buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('Expected PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size > buffer.length - offset - 12) throw new Error('Truncated PNG');
    const data = buffer.subarray(offset + 8, offset + 8 + size);
    if (type === 'IHDR') {
      if (size !== 13) throw new Error('Invalid PNG header');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (
        data[8] !== 8 ||
        ![2, 6].includes(data[9]!) ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      )
        throw new Error('Only non-interlaced 8-bit RGB/RGBA PNG is supported');
      channels = data[9] === 6 ? 4 : 3;
      if (!width || !height || width * height > 16_000_000)
        throw new Error('PNG exceeds 16 million pixels');
    } else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    offset += size + 12;
  }
  if (!channels || !chunks.length) throw new Error('Incomplete PNG');
  const stride = width * channels;
  const expected = (stride + 1) * height;
  const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: expected });
  if (raw.length !== expected) throw new Error('Invalid PNG pixel data length');
  const pixels = Buffer.alloc(width * height * 4);
  const decoded = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    if (filter > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= channels ? decoded[index - channels]! : 0;
      const up = y > 0 ? decoded[index - stride]! : 0;
      const corner = y > 0 && x >= channels ? decoded[index - stride - channels]! : 0;
      const p = left + up - corner;
      const a = Math.abs(p - left);
      const b = Math.abs(p - up);
      const c = Math.abs(p - corner);
      const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter]!;
      decoded[index] = (raw[y * (stride + 1) + x + 1]! + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const source = y * stride + x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = decoded[source]!;
      pixels[target + 1] = decoded[source + 1]!;
      pixels[target + 2] = decoded[source + 2]!;
      pixels[target + 3] = channels === 4 ? decoded[source + 3]! : 255;
    }
  }
  return { width, height, pixels };
}
