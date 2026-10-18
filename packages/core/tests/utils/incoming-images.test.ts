import { describe, expect, it } from 'vitest';
import {
  base64DecodedBytes,
  buildUserContentBlocks,
  IncomingImageError,
  MAX_INCOMING_DOCUMENT_BYTES,
  MAX_INCOMING_IMAGE_BYTES,
  MAX_INCOMING_IMAGES,
  parseIncomingAttachments,
  parseIncomingImages,
} from '../../src/utils/incoming-images.js';

// 1×1 transparent PNG, valid base64.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// Valid base64 whose bytes match no image signature, so only the labels can
// decide its media type (recognisable bytes override a wrong label).
const OPAQUE_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAA';

describe('parseIncomingImages', () => {
  it('returns [] for no images', () => {
    expect(parseIncomingImages(undefined, undefined)).toEqual([]);
    expect(parseIncomingImages([], undefined)).toEqual([]);
  });

  it('converts bare base64 + mediaType to an ImageBlock', () => {
    const blocks = parseIncomingImages([{ data: PNG_B64, mediaType: 'image/png' }]);
    expect(blocks).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } },
    ]);
  });

  it('strips a data-URL prefix and derives the media type from it', () => {
    const blocks = parseIncomingImages([{ data: `data:image/jpeg;base64,${OPAQUE_B64}` }]);
    expect(blocks[0]?.source.media_type).toBe('image/jpeg');
    expect(blocks[0]?.source.data).toBe(OPAQUE_B64);
  });

  it('explicit mediaType wins over the data-URL prefix', () => {
    const blocks = parseIncomingImages([
      { data: `data:image/png;base64,${OPAQUE_B64}`, mediaType: 'image/webp' },
    ]);
    expect(blocks[0]?.source.media_type).toBe('image/webp');
  });

  it('accepts the legacy imageBase64 field as a trailing image', () => {
    const blocks = parseIncomingImages(
      [{ data: PNG_B64, mediaType: 'image/png' }],
      `data:image/png;base64,${PNG_B64}`,
    );
    expect(blocks).toHaveLength(2);
  });

  it('defaults media type to image/png when nothing declares it', () => {
    const blocks = parseIncomingImages([{ data: PNG_B64 }]);
    expect(blocks[0]?.source.media_type).toBe('image/png');
  });

  it('rejects more than MAX_INCOMING_IMAGES', () => {
    const many = Array.from({ length: MAX_INCOMING_IMAGES + 1 }, () => ({
      data: PNG_B64,
      mediaType: 'image/png',
    }));
    expect(() => parseIncomingImages(many)).toThrow(IncomingImageError);
  });

  it('rejects unsupported media types', () => {
    expect(() => parseIncomingImages([{ data: PNG_B64, mediaType: 'image/svg+xml' }])).toThrow(
      /unsupported media type/,
    );
  });

  it('rejects empty and non-base64 data', () => {
    expect(() => parseIncomingImages([{ data: '' }])).toThrow(/empty image data/);
    expect(() => parseIncomingImages([{ data: 'not valid base64!!' }])).toThrow(/not valid base64/);
  });

  it('counts base64 padding as non-data when enforcing the byte cap', () => {
    const payload = (n: number): string => {
      const bytes = Buffer.alloc(n);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
      return bytes.toString('base64');
    };
    // Exactly-at-cap and cap-1 payloads end in `=`/`==`; both fit the cap.
    for (const n of [
      MAX_INCOMING_IMAGE_BYTES - 2,
      MAX_INCOMING_IMAGE_BYTES - 1,
      MAX_INCOMING_IMAGE_BYTES,
    ]) {
      const data = payload(n);
      expect(base64DecodedBytes(data)).toBe(n);
      expect(parseIncomingImages([{ data, mediaType: 'image/png' }])).toHaveLength(1);
    }
    // One byte over the cap is still rejected.
    expect(() =>
      parseIncomingImages([
        { data: payload(MAX_INCOMING_IMAGE_BYTES + 1), mediaType: 'image/png' },
      ]),
    ).toThrow(/exceeds the/);
  });

  it('base64DecodedBytes handles padded, unpadded and empty input', () => {
    expect(base64DecodedBytes('')).toBe(0);
    expect(base64DecodedBytes('QQ==')).toBe(1);
    expect(base64DecodedBytes('QUI=')).toBe(2);
    expect(base64DecodedBytes('QUJD')).toBe(3);
    expect(base64DecodedBytes('QQ')).toBe(1); // unpadded tail
  });

  it('accepts a PDF of exactly the document cap', () => {
    const bytes = Buffer.alloc(MAX_INCOMING_DOCUMENT_BYTES);
    Buffer.from('%PDF-1.4').copy(bytes);
    const out = parseIncomingAttachments([
      { data: bytes.toString('base64'), mediaType: 'application/pdf', name: 'a.pdf' },
    ]);
    expect(out.pdfs).toHaveLength(1);
    expect(out.pdfs[0]?.bytes).toBe(MAX_INCOMING_DOCUMENT_BYTES);
  });

  it('rejects oversized images', () => {
    // Base64 length for > MAX bytes: 4/3 ratio, padded to a multiple of 4.
    const b64len = Math.ceil(((MAX_INCOMING_IMAGE_BYTES + 4) * 4) / 3 / 4) * 4;
    const huge = 'A'.repeat(b64len);
    expect(() => parseIncomingImages([{ data: huge, mediaType: 'image/png' }])).toThrow(
      /exceeds the/,
    );
  });
});

describe('buildUserContentBlocks', () => {
  const img = parseIncomingImages([{ data: PNG_B64, mediaType: 'image/png' }]);

  it('puts images before the text block', () => {
    const blocks = buildUserContentBlocks('hello', img);
    expect(blocks.map((b) => b.type)).toEqual(['image', 'text']);
  });

  it('omits the text block for an image-only message', () => {
    expect(buildUserContentBlocks('', img).map((b) => b.type)).toEqual(['image']);
  });
});
