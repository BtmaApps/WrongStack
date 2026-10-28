/** Content-addressed summary of one provider request; built by `chronicle/prompt-manifest.ts`. */
export interface ChroniclePromptManifest {
  manifestId: string;
  messageCount: number;
  estimatedMessageTokens: number;
  contentBytes: number;
  roleCounts: Record<string, number>;
  blockCounts: Record<string, number>;
  system: {
    blockCount: number;
    bytes: number;
    hash: string;
    /**
     * Per-block composition, in request order: which prompt layer each block
     * is (`identity`, `skills`, `project-instructions`, …), its size and hash.
     * Says what fills the system prompt and which block changed when the
     * prompt-cache prefix broke. Absent on manifests written before it existed.
     */
    blocks?: Array<{ source: string; bytes: number; hash: string }>;
  };
  messages: Array<{
    index: number;
    role: string;
    bytes: number;
    estimatedTokens?: number;
    hash: string;
    blocks: Record<string, number>;
  }>;
  tools: {
    count: number;
    estimatedDefinitionTokens: number;
    manifestHash: string;
    names: string[];
    mutating: number;
    destructive: number;
  };
  request: Record<string, unknown>;
}
