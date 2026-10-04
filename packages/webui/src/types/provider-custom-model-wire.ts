/** Metadata persisted by the custom-provider model editor in provider add/update messages. */
export interface ProviderCustomModelWire {
  name?: string | undefined;
  maxOutput?: number | undefined;
  capabilities?:
    | {
        maxContext?: number | undefined;
        maxOutput?: number | undefined;
        tools?: boolean | undefined;
        vision?: boolean | undefined;
        reasoning?: boolean | undefined;
        streaming?: boolean | undefined;
        jsonMode?: boolean | undefined;
      }
    | undefined;
  /**
   * Full models.dev model payload (ME-2/ME-3). Stores all schema fields for
   * catalog overrides (delta) and custom (non-catalog) models. Validated
   * server-side by the ME-1 zod schema before persistence.
   */
  modelsDev?: Record<string, unknown> | undefined;
}
