export const DESKTOP_CHECKSUM_MANIFEST: 'SHA256SUMS.txt';

export interface DesktopChecksumEntry {
  name: string;
  sha256: string;
}

export function writeDesktopChecksums(releaseDir: string): Promise<DesktopChecksumEntry[]>;
