import type { Tool } from '../types/tool.js';

/**
 * A function that wraps (decorates) an existing tool. Receives the
 * original tool and returns a modified version — typically the same
 * tool with a wrapped `execute` / `executeStream`, or with modified
 * metadata (description, permission).
 *
 * Use `ToolRegistry.wrap()` to apply; the wrapper is called immediately
 * and the result replaces the registered tool. Multiple wraps stack —
 * each wrapper receives the output of the previous.
 *
 * @example
 * ```ts
 * registry.wrap('read', (original) => ({
 *   ...original,
 *   async execute(input, ctx, opts) {
 *     console.log('read called');
 *     return original.execute(input, ctx, opts);
 *   }
 * }));
 * ```
 */
export type ToolWrapper = (tool: Tool) => Tool;

/** One layer of a tool's registration stack (base tool or a wrapper over it). */
export interface ToolRegistration {
  tool: Tool;
  owner: string;
  previous?: ToolRegistration;
  wrapper?: ToolWrapper;
  wrapperOwner?: string;
  removed?: boolean;
}
