/** Bounded read-only context selected explicitly from a live browser viewport. */
export interface BrowserElementSelection {
  browserId?: string | undefined;
  ownerId?: string | undefined;
  url: string;
  title: string;
  capturedAt: string;
  selector: string;
  tag: string;
  role: string;
  text: string;
  styles: Record<string, string>;
  bounds: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  image?: { data: string; mimeType: 'image/jpeg'; width: number; height: number } | undefined;
}
