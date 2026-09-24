import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type ImageAttachmentError,
  isPdfFile,
  MAX_ATTACHED_PDF_BYTES,
  processPdfFile,
  toWireImages,
} from '../../src/components/ChatInput/image-attachments';
import { AttachmentGallery } from '../../src/components/MessageBubble/AttachmentGallery';

describe('PDF attachments', () => {
  it('recognizes a PDF by type or by extension', () => {
    expect(isPdfFile(new File(['x'], 'a.bin', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile(new File(['x'], 'REPORT.PDF', { type: '' }))).toBe(true);
    expect(isPdfFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(false);
  });

  it('keeps the file as picked and pins the media type', async () => {
    const pdf = new File(['%PDF-1.4'], 'spec.pdf', { type: '' });
    const att = await processPdfFile(pdf);
    expect(att).toMatchObject({ mediaType: 'application/pdf', name: 'spec.pdf', bytes: 8 });
    expect(att.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
    // It rides the image wire; the server tells it apart by media type.
    expect(toWireImages([att])[0]).toEqual({
      data: Buffer.from('%PDF-1.4').toString('base64'),
      mediaType: 'application/pdf',
      name: 'spec.pdf',
    });
  });

  it('refuses a PDF over the per-file cap', async () => {
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: MAX_ATTACHED_PDF_BYTES + 1 });
    await expect(processPdfFile(big)).rejects.toMatchObject({
      reason: 'pdf_too_large',
    } satisfies Partial<ImageAttachmentError>);
  });
});

describe('AttachmentGallery with a PDF', () => {
  it('draws a name chip instead of an <img> for the PDF', () => {
    render(
      <AttachmentGallery
        notRetainedLabel="not retained"
        attachments={[
          {
            id: 'p1',
            kind: 'image',
            mediaType: 'application/pdf',
            bytes: 2048,
            name: 'report.pdf',
            dataUrl: 'data:application/pdf;base64,JVBERi0=',
          },
          {
            id: 'i1',
            kind: 'image',
            mediaType: 'image/png',
            bytes: 10,
            dataUrl: 'data:image/png;base64,AA',
          },
        ]}
      />,
    );
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
});
