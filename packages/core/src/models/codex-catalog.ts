/** Legacy API retained for compatibility. Account catalogs supply model metadata. */
export interface CodexModelMeta {
  id: string;
  name: string;
  description: string;
  current?: boolean;
}
/** @deprecated No models are bundled for account authentication. */
export const CODEX_MODELS: ReadonlyArray<CodexModelMeta> = [];
/** @deprecated Read metadata from the selected account catalog instead. */
export function codexModelMeta(_id: string): CodexModelMeta | undefined {
  return undefined;
}
