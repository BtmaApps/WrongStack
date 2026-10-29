/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { FileSkeletonResult } from './skeleton-extractor.js';

/** One directory file's place in the result; its skeleton is in `skeleton`. */
export type CodebaseSkeletonFile = Pick<FileSkeletonResult, 'file' | 'lang' | 'stats'>;

export interface CodebaseSkeletonOutput {
  path: string;
  isDir: boolean;
  skeleton: string;
  stats: {
    originalLines: number;
    skeletonLines: number;
    tokenSavingsPercent: number;
    symbolCount: number;
    fileCount?: number;
  };
  files?: CodebaseSkeletonFile[];
  /** Directory files left out to stay within `maxChars`, directory-relative. */
  omittedFiles?: string[];
  /** The directory walk stopped at `maxFiles` with more files left. */
  moreFiles?: boolean;
  maxFiles?: number;
  maxChars?: number;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
