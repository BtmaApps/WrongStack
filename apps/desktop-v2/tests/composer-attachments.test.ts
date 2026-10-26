import { describe, expect, it } from 'vitest';
import {
  attachmentBytes,
  transcriptAttachments,
  validateAttachments,
  wireAttachments,
} from '../src/composer-attachments';

const image = { data: 'iVBORw0KGgo=', mediaType: 'image/png', name: 'screen.png' };
const pdf = { data: 'JVBERi0xLjQK', mediaType: 'application/pdf', name: 'brief.pdf' };
describe('desktop attachment contracts', () => {
  it('keeps wire bytes and names intact without leaking preview IDs or decoded metadata', () => {
    expect(wireAttachments([{ ...image, id: 'draft-1', bytes: 8 }])).toEqual([image]);
    expect(attachmentBytes('AQ==')).toBe(1);
    expect(attachmentBytes('AQI=')).toBe(2);
    expect(() => validateAttachments([image, pdf])).not.toThrow();
  });
  it('separates the eight-image and four-PDF count budgets', () => {
    expect(() =>
      validateAttachments([...Array(8).fill(image), ...Array(4).fill(pdf)]),
    ).not.toThrow();
    expect(() => validateAttachments(Array(9).fill(image))).toThrow('8 images and 4 PDFs');
    expect(() => validateAttachments(Array(5).fill(pdf))).toThrow('8 images and 4 PDFs');
  });
  it('refuses malformed media, disguised documents, and per-file overflow', () => {
    expect(() => validateAttachments([{ ...image, mediaType: 'image/svg+xml' }])).toThrow(
      'supported',
    );
    expect(() => validateAttachments([{ ...image, data: 'not base64!' }])).toThrow('invalid');
    expect(() => validateAttachments([{ ...pdf, data: image.data }])).toThrow('not a PDF');
    expect(() => validateAttachments([{ ...image, data: 'AAAA'.repeat(1400000) }])).toThrow(
      'file limit',
    );
  });
  it('enforces the smaller persisted queue budget without silently stripping files', () => {
    const medium = { ...image, data: 'AAAA'.repeat(1000000) };
    expect(() => validateAttachments([medium, medium])).not.toThrow();
    expect(() => validateAttachments([medium, medium], true)).toThrow('too large to queue');
  });
  it('replays canonical image and PDF blocks and excludes remote or active previews', () => {
    expect(
      transcriptAttachments([
        {
          type: 'image',
          source: { type: 'base64', media_type: image.mediaType, data: image.data },
        },
        {
          type: 'document',
          name: pdf.name,
          source: { type: 'base64', media_type: pdf.mediaType, data: pdf.data },
        },
        { type: 'image', source: { type: 'url', url: 'https://example.invalid/private.png' } },
        { mediaType: 'text/html', data: 'AAAA' },
      ]),
    ).toEqual([
      expect.objectContaining({ data: image.data, mediaType: image.mediaType }),
      expect.objectContaining(pdf),
    ]);
  });
});
