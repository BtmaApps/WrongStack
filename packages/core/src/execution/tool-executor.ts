import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { areSubagentsAllowed } from '../coordination/session-subagent-policy.js';
import { type Context, resolveEventSessionId } from '../core/context.js';
import {
  getDangerousCapabilities,
  hasCapability,
  hasDangerousCapabilityForSubagents,
  ToolCapabilities,
} from '../security/capabilities.js';
import { describeWriteTargets } from '../security/permission-helpers.js';
import {
  approvalRecord,
  DEFAULT_ALWAYS_TRUST_TTL_MS,
  isPersistentApproval,
} from '../security/scoped-approval.js';
import type { ToolResultBlock, ToolUseBlock } from '../types/blocks.js';
import type { ToolResultRenderMode, ToolResultRenderModeConfig } from '../types/config.js';
import { isWrongStackError } from '../types/errors.js';
import type { Tool } from '../types/tool.js';
import {
  GOVERNED_TOOL_EXECUTOR_META_KEY,
  type GovernedToolExecutor,
  type ToolBatchResult,
  type ToolConfirmPendingResult,
  type ToolExecutionOutput,
  type ToolExecutorOptions,
  type ToolExecutorStrategy,
} from '../types/tool-executor.js';
import { toErrorMessage } from '../utils/error.js';
import { createToolOutputSerializer } from '../utils/tool-output-serializer.js';
import { resolveToolResultRenderMode } from '../utils/tool-result-render-mode.js';
import { subjectForToolInput } from '../utils/tool-subject.js';
import { toolErrorResult } from './tool-error-taxonomy.js';
import { validateToolInputAndHooks } from './tool-executor-guard.js';
import {
  logToolFailure as logToolFailureEvent,
  logToolSuccess as logToolSuccessEvent,
} from './tool-executor-logging.js';
import { deniedResult, unknownToolResult } from './tool-executor-results.js';
import { runToolWithTimeout } from './tool-executor-runner.js';
import {
  classifyToolError,
  hashPermissionInput,
  maybePersistLargeToolOutput,
} from './tool-executor-support.js';

export { classifyToolError } from './tool-executor-support.js';

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export class ToolExecutor {
  /** Minimum gap between coalesced `partial_output` tool.progress emits. */
  static readonly PROGRESS_EMIT_INTERVAL_MS = 100;
  /** Max chars of accumulated stream text carried per coalesced emit (tail). */
  static readonly PROGRESS_TAIL_CHARS = 16_384;
  /** Max chars of the head (beginning of output) kept alongside the tail. */
  static readonly PROGRESS_HEAD_CHARS = 16_384;

  private readonly serializer;
  private readonly iterationTimeoutMs: number;
  private readonly maxToolTimeoutMs: number;
  private readonly maxParallelTools: number;

  constructor(
    private readonly registry: { get(name: string): Tool | undefined; list(): Tool[] },
    private opts: ToolExecutorOptions,
  ) {
    this.iterationTimeoutMs = opts.iterationTimeoutMs ?? 300_000;
    this.maxToolTimeoutMs = opts.maxToolTimeoutMs ?? 300_000;
    const requestedParallelism = opts.maxParallelTools ?? 4;
    this.maxParallelTools = Number.isFinite(requestedParallelism)
      ? Math.max(1, Math.min(16, Math.floor(requestedParallelism)))
      : 4;
    this.serializer = createToolOutputSerializer({
      perIterationOutputCapBytes: opts.perIterationOutputCapBytes ?? 100_000,
    });
  }

  clearConfirmAwaiter(): void {
    this.opts.confirmAwaiter = undefined;
  }

  private hintRenderMode(toolName: string): void {
    const renderer = this.opts.renderer;
    if (!renderer || typeof renderer.setResultRenderMode !== 'function') return;
    const modes: ToolResultRenderModeConfig | undefined = this.opts.resultRenderModes;
    const mode: ToolResultRenderMode = resolveToolResultRenderMode(modes, toolName);
    renderer.setResultRenderMode(toolName, mode);
  }

  private logToolSuccess(
    ctx: Context,
    use: ToolUseBlock,
    toolName: string,
    durationMs: number,
    outputChars: number,
  ): void {
    logToolSuccessEvent(this.opts, ctx, use, toolName, durationMs, outputChars);
  }

  private logToolFailure(
    ctx: Context,
    use: ToolUseBlock,
    toolName: string,
    durationMs: number,
    err: unknown,
  ): void {
    logToolFailureEvent(this.opts, ctx, use, toolName, durationMs, err);
  }

  async executeBatch(
    toolUses: ToolUseBlock[],
    ctx: Context,
    strategy: ToolExecutorStrategy,
  ): Promise<ToolBatchResult> {
    return this.withGovernedExecutionBridge(ctx, () =>
      this.executeBatchInternal(toolUses, ctx, strategy),
    );
  }

  private async executeBatchInternal(
    toolUses: ToolUseBlock[],
    ctx: Context,
    strategy: ToolExecutorStrategy,
  ): Promise<ToolBatchResult> {
    let budget = this.opts.perIterationOutputCapBytes ?? 100_000;

    const runOne = async (use0: ToolUseBlock): Promise<ToolExecutionOutput> => {
      const start = Date.now();
      let use = use0;
      const tool = this.registry.get(use.name);

      if (!tool) {
        const result = unknownToolResult(use, () => this.registry.list().map((t) => t.name));
        budget = this.budgetForString(result.content, budget);
        return { result, tool, durationMs: Date.now() - start, settlement: 'unknown_tool' };
      }

      if (!areSubagentsAllowed(ctx) && hasCapability(tool, ToolCapabilities.SUBAGENT_SPAWN)) {
        const result = deniedResult(
          use,
          'Subagents are disabled for this session. This policy is locked after the session starts.',
        );
        budget = this.budgetForString(result.content, budget);
        return { result, tool, durationMs: Date.now() - start, settlement: 'denied_by_policy' };
      }

      const guard = await validateToolInputAndHooks(tool, use, ctx, this.opts);
      if (!guard.ok) {
        const result = guard.errorResult!;
        budget = this.budgetForString(result.content, budget);
        return { result, tool, durationMs: Date.now() - start, settlement: guard.settlement };
      }

      use = guard.use;
      const preToolContext = guard.preToolContext;
      const boundary = guard.boundary ?? { decision: 'allow' as const };
      const toolDangerousCaps = getDangerousCapabilities(tool);

      const decision = await this.opts.permissionPolicy.evaluate(tool, use.input, ctx);
      let effectivePermission = decision.permission;
      const policy = this.opts.permissionPolicy;
      const yolo = policy.getYolo?.() === true;
      // A trust-file `auto` must not widen into arbitrary dangerous-capability
      // execution, so it still confirms below. YOLO and an explicit
      // `--allowed-tools` grant are the operator's own launch decision; without
      // this waiver `--allowed-tools write` re-prompted — and in a script
      // (nobody to answer) the write was simply denied.
      const authoritativeAuto = decision.source === 'yolo' || decision.launchGrant === true;

      const capabilityDowngraded =
        toolDangerousCaps.length > 0 &&
        effectivePermission === 'auto' &&
        !yolo &&
        !authoritativeAuto;
      if (capabilityDowngraded) {
        effectivePermission = 'confirm';
      }

      if (boundary.decision === 'confirm' && effectivePermission !== 'deny') {
        effectivePermission = 'confirm';
      }

      this.opts.events?.emit('permission.evaluated', {
        sessionId: resolveEventSessionId(ctx),
        ...(ctx.traceId ? { traceId: ctx.traceId } : {}),
        ...(ctx.activeLogicalRequestId ? { logicalRequestId: ctx.activeLogicalRequestId } : {}),
        ...(ctx.activePromptManifestId ? { promptManifestId: ctx.activePromptManifestId } : {}),
        ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
        name: tool.name,
        id: use.id,
        inputHash: hashPermissionInput(use.input, this.opts.secretScrubber),
        policyDecision: decision.permission,
        effectiveDecision: effectivePermission,
        decisionSource: decision.source,
        ...(decision.reason ? { reason: decision.reason } : {}),
        ...((decision.riskTier ?? tool.riskTier)
          ? { riskTier: decision.riskTier ?? tool.riskTier }
          : {}),
        yoloEnabled: yolo,
        boundaryDecision: boundary.decision,
        ...(boundary.reason ? { boundaryReason: boundary.reason } : {}),
        capabilityDowngraded,
        taskId: ctx.currentKanbanTaskId,
        boardId: ctx.currentKanbanBoardId,
        ...(typeof ctx.provider === 'object'
          ? { provider: (ctx.provider as { id: string }).id }
          : {}),
        ...(ctx.model ? { model: ctx.model } : {}),
      });

      if (effectivePermission === 'deny') {
        const result = deniedResult(use, decision.reason);
        await this.toolSkipped(tool, use, ctx, String(result.content));
        budget = this.budgetForString(result.content, budget);
        return { result, tool, durationMs: Date.now() - start, settlement: 'denied_by_policy' };
      }

      if (effectivePermission === 'confirm') {
        const suggestedPattern =
          boundary.decision === 'confirm'
            ? `kanban-boundary:${boundary.path ?? tool.name}`
            : (subjectForToolInput(tool.name, use.input, tool.subjectKey, tool.subjectFields) ??
              tool.name);
        // VULN-001 Phase 2: real destinations from Tool.writeTargets so the
        // confirm payload shows what the call would write, not `directory: "."`.
        const writeTargets = describeWriteTargets(tool, use.input);
        if (this.opts.confirmAwaiter) {
          const awaiter = this.opts.confirmAwaiter;
          const choice = await new Promise<
            | 'yes'
            | 'no'
            | 'always'
            | 'always-exact'
            | 'always-command'
            | 'always-tool'
            | 'deny'
            | 'abort'
          >((resolve, reject) => {
            const signal = ctx.signal;
            const onAbort = () => resolve('abort');
            if (signal.aborted) {
              resolve('abort');
              return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
            awaiter(tool, use.input, use.id, suggestedPattern).then(
              (c) => {
                signal.removeEventListener('abort', onAbort);
                resolve(c);
              },
              (e) => {
                signal.removeEventListener('abort', onAbort);
                reject(e);
              },
            );
          });
          if (isPersistentApproval(choice)) {
            const approval = approvalRecord(choice, tool, use.input, ctx, suggestedPattern);
            await this.opts.permissionPolicy.trust({
              tool: tool.name,
              pattern: approval.pattern,
              ttlMs: DEFAULT_ALWAYS_TRUST_TTL_MS,
            });
            this.opts.events?.emit('trust.persisted', {
              sessionId: resolveEventSessionId(ctx),
              tool: tool.name,
              ...approval,
              decision: 'always',
            });
          }
          if (choice !== 'yes' && !isPersistentApproval(choice)) {
            const result = {
              type: 'tool_result' as const,
              tool_use_id: use.id,
              content:
                choice === 'abort'
                  ? `Tool "${tool.name}" was not executed — the run was aborted while awaiting confirmation.`
                  : `Tool "${tool.name}" denied by user.`,
              is_error: true,
            };
            await this.toolSkipped(tool, use, ctx, result.content);
            budget = this.budgetForString(result.content, budget);
            return {
              result,
              tool,
              durationMs: Date.now() - start,
              settlement: choice === 'abort' ? 'aborted' : 'declined',
            };
          }
        } else {
          const pending: ToolConfirmPendingResult = {
            type: 'tool_confirm_pending',
            toolUseId: use.id,
            toolName: tool.name,
            input: use.input,
            ...(preToolContext ? { preToolContext } : {}),
            suggestedPattern,
            decisionSource: decision.source,
            riskTier: decision.riskTier ?? tool.riskTier,
            ...(writeTargets.length > 0 ? { writeTargets } : {}),
            ...(boundary.decision === 'confirm' && boundary.reason
              ? { boundaryReason: boundary.reason }
              : {}),
          };
          return { result: pending, tool, durationMs: Date.now() - start };
        }
      }

      const toolCapsForAudit = hasDangerousCapabilityForSubagents(tool)
        ? (tool.capabilities ?? [])
        : [];

      const span = this.opts.tracer?.startSpan(`tool.${tool.name}`, {
        'tool.name': tool.name,
        'tool.mutating': tool.mutating,
        'tool.permission': tool.permission,
        'tool.capabilities':
          toolCapsForAudit.length > 0 ? JSON.stringify(tool.capabilities ?? []) : '[]',
        'tool.has_dangerous_capabilities': toolCapsForAudit.length > 0,
      });
      let postRan = false;
      try {
        const inputPath =
          use.input && typeof use.input === 'object'
            ? (use.input as Record<string, unknown>).path
            : undefined;
        const caps = tool.capabilities ?? [];
        const hasFileCapability = caps.includes('fs.read') || caps.includes('fs.write');
        const absPath =
          hasFileCapability && typeof inputPath === 'string'
            ? path.isAbsolute(inputPath)
              ? inputPath
              : path.resolve(ctx.projectRoot, inputPath)
            : undefined;
        let writeTargetExisted: boolean | undefined;
        if (tool.name === 'write' && caps.includes('fs.write') && absPath) {
          writeTargetExisted = await fs.stat(absPath).then(
            (stat) => stat.isFile(),
            (error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? false : undefined),
          );
        }

        let producedText = await this.produceToolOutput(tool, use, ctx, budget);
        if (preToolContext?.contextAs === 'inline') {
          producedText = `${producedText}\n\n${preToolContext.text}`;
        }
        let { block: result, bytes } = this.settleToolOutput(tool, use, producedText, budget);
        budget -= bytes;
        if (preToolContext?.contextAs === 'separate') {
          ctx.pendingPostToolContext = ctx.pendingPostToolContext
            ? `${ctx.pendingPostToolContext}\n\n${preToolContext.text}`
            : preToolContext.text;
        }
        postRan = true;
        if (this.opts.hookRunner?.has('PostToolUse')) {
          const post = await this.opts.hookRunner.postToolUse(
            tool.name,
            use.input,
            { content: String(result.content), isError: !!result.is_error },
            ctx,
          );
          if (post.additionalContext) {
            if (post.contextAs === 'separate') {
              ctx.pendingPostToolContext = ctx.pendingPostToolContext
                ? `${ctx.pendingPostToolContext}\n\n${post.additionalContext}`
                : post.additionalContext;
            } else {
              const appended = `\n\n${post.additionalContext}`;
              result = { ...result, content: `${result.content}${appended}` };
              budget = Math.max(0, budget - Buffer.byteLength(appended, 'utf8'));
            }
          }
        }
        const outputChars = typeof result.content === 'string' ? result.content.length : 0;
        span?.setAttribute('tool.is_error', !!result.is_error);
        span?.setAttribute('tool.output_bytes', outputChars);
        this.logToolSuccess(ctx, use, tool.name, Date.now() - start, outputChars);

        if (!result.is_error && typeof inputPath === 'string' && absPath) {
          const operation =
            tool.name === 'read'
              ? 'read'
              : caps.includes('fs.write') && tool.name === 'write'
                ? writeTargetExisted === false
                  ? 'create'
                  : 'update'
                : caps.includes('fs.write')
                  ? 'update'
                  : 'read';
          const ts = new Date().toISOString();
          ctx.recordFileEvent?.({
            operation,
            filePath: inputPath,
            absPath,
            toolName: tool.name,
            toolUseId: use.id,
            durationMs: Date.now() - start,
          });
          this.opts.events?.emit('file.event', {
            operation,
            filePath: inputPath,
            absPath,
            sessionId: resolveEventSessionId(ctx),
            agentId: ctx.agentId,
            agentName: ctx.agentName,
            provider:
              typeof ctx.provider === 'object'
                ? (ctx.provider as { id: string }).id
                : String(ctx.provider),
            model: ctx.model,
            ...(ctx.activeLogicalRequestId ? { logicalRequestId: ctx.activeLogicalRequestId } : {}),
            ...(ctx.activePromptManifestId ? { promptManifestId: ctx.activePromptManifestId } : {}),
            provenanceConfidence:
              ctx.activeLogicalRequestId && ctx.activePromptManifestId ? 'explicit' : 'unknown',
            toolName: tool.name,
            toolUseId: use.id,
            scope: ctx.currentKanbanTaskId ? 'task' : 'session',
            taskId: ctx.currentKanbanTaskId,
            boardId: ctx.currentKanbanBoardId,
            timestamp: ts,
            durationMs: Date.now() - start,
          });
        }

        return { result, tool, durationMs: Date.now() - start };
      } catch (err) {
        if (!postRan) await this.toolSkipped(tool, use, ctx, toErrorMessage(err));
        if (isWrongStackError(err)) {
          if (err instanceof Error) span?.recordError(err);
          span?.setAttribute('tool.is_error', true);
          this.logToolFailure(ctx, use, tool.name, Date.now() - start, err);
          throw err;
        }
        const msg = toErrorMessage(err);
        const scrubbed = this.opts.secretScrubber.scrub(msg);
        const { category, retryable, detail } = classifyToolError(err);
        this.hintRenderMode(tool.name);
        this.opts.renderer?.writeToolResult(tool.name, scrubbed, true);
        const result = toolErrorResult(use, err, {
          scrubber: (s) => this.opts.secretScrubber.scrub(s),
        });
        // Error results are iteration output too: cap them with the same byte
        // budget the success path enforces, or a single failing tool whose
        // Error message is huge can defeat perIterationOutputCapBytes
        // entirely (budgetForString only charges; it never truncates).
        const cappedError = this.serializer.enforceCap(result.content, budget);
        result.content = cappedError.text;
        budget = cappedError.newBudget;
        if (err instanceof Error) span?.recordError(err);
        span?.setAttribute('tool.is_error', true);
        span?.setAttribute('tool.error_category', category);
        span?.setAttribute('tool.error_retryable', retryable);
        if (detail) span?.setAttribute('tool.error_detail', detail);
        this.logToolFailure(ctx, use, tool.name, Date.now() - start, err);
        return {
          result,
          tool,
          durationMs: Date.now() - start,
          settlement: ctx.signal.aborted ? 'aborted' : 'failed',
        };
      } finally {
        span?.end();
      }
    };

    const safeRun = async (use: ToolUseBlock): Promise<ToolExecutionOutput> => {
      try {
        return await runOne(use);
      } catch (err) {
        const isStructured = isWrongStackError(err);
        const msg = isStructured ? err.describe() : toErrorMessage(err);
        const scrubbed = this.opts.secretScrubber.scrub(msg);
        const tool = this.registry.get(use.name);
        const toolName = tool?.name ?? use.name;
        this.hintRenderMode(toolName);
        this.opts.renderer?.writeToolResult(toolName, scrubbed, true);

        const result = toolErrorResult(use, err, {
          scrubber: (s) => this.opts.secretScrubber.scrub(s),
        });
        if (isStructured) {
          result.content = scrubbed;
        }
        // Same cap discipline as the plain-Error catch above — structured
        // describe() payloads are just as unbounded as Error messages.
        const cappedError = this.serializer.enforceCap(result.content, budget);
        result.content = cappedError.text;
        budget = cappedError.newBudget;
        return {
          result,
          tool,
          durationMs: 0,
          settlement: ctx.signal.aborted ? 'aborted' : 'failed',
        };
      }
    };

    if (strategy === 'sequential') {
      const outputs: ToolExecutionOutput[] = [];
      for (const use of toolUses) {
        if (use) outputs.push(await safeRun(use));
      }
      return { outputs, remainingBudget: budget };
    }

    if (strategy === 'parallel') {
      const outputs = await mapWithConcurrency(toolUses, this.maxParallelTools, safeRun);
      return { outputs, remainingBudget: budget };
    }

    const nonMutating: ToolUseBlock[] = [];
    const mutating: ToolUseBlock[] = [];
    for (const use of toolUses) {
      if (!use) continue;
      const tool = this.registry.get(use.name);
      if (tool?.mutating) mutating.push(use);
      else nonMutating.push(use);
    }
    const firstPass = await mapWithConcurrency(nonMutating, this.maxParallelTools, safeRun);
    const secondPass: ToolExecutionOutput[] = [];
    for (const use of mutating) {
      secondPass.push(await safeRun(use));
    }
    return {
      outputs: [...firstPass, ...secondPass],
      remainingBudget: budget,
    };
  }

  private async withGovernedExecutionBridge<T>(ctx: Context, run: () => Promise<T>): Promise<T> {
    const previous = ctx.meta[GOVERNED_TOOL_EXECUTOR_META_KEY];
    if (typeof previous === 'function') return run();

    const bridge: GovernedToolExecutor = async (toolName, input) => {
      const nestedUse: ToolUseBlock = {
        type: 'tool_use',
        id: `nested-${randomUUID()}`,
        name: toolName,
        input,
      };
      const batch = await this.executeBatchInternal([nestedUse], ctx, 'sequential');
      const output = batch.outputs[0];
      if (!output) {
        return { success: false, error: `tool "${toolName}" produced no result` };
      }
      if (output.result.type === 'tool_confirm_pending') {
        return {
          success: false,
          error: `tool "${toolName}" requires separate confirmation; call it directly`,
        };
      }
      if (output.result.is_error) {
        return { success: false, error: String(output.result.content) };
      }
      return { success: true, result: output.result.content };
    };

    ctx.meta[GOVERNED_TOOL_EXECUTOR_META_KEY] = bridge;
    try {
      return await run();
    } finally {
      if (previous === undefined) delete ctx.meta[GOVERNED_TOOL_EXECUTOR_META_KEY];
      else ctx.meta[GOVERNED_TOOL_EXECUTOR_META_KEY] = previous;
    }
  }

  async executeTool(
    tool: Tool,
    use: ToolUseBlock,
    ctx: Context,
    budget: number,
    preToolContext?: { text: string; contextAs: 'inline' | 'separate' },
  ): Promise<{ block: ToolResultBlock; bytes: number }> {
    return this.withGovernedExecutionBridge(ctx, async () => {
      let text: string;
      try {
        text = await this.produceToolOutput(tool, use, ctx, budget);
      } catch (err) {
        await this.toolSkipped(tool, use, ctx, toErrorMessage(err));
        throw err;
      }
      if (preToolContext?.contextAs === 'inline') {
        text = `${text}\n\n${preToolContext.text}`;
      }
      const settled = this.settleToolOutput(tool, use, text, budget);
      if (preToolContext?.contextAs === 'separate') {
        ctx.pendingPostToolContext = ctx.pendingPostToolContext
          ? `${ctx.pendingPostToolContext}\n\n${preToolContext.text}`
          : preToolContext.text;
      }
      // This is the run a confirm prompt approved. It used to skip PostToolUse
      // entirely, so an approved write never released the file lock its
      // PreToolUse claimed and never reached post-write hooks (type-gate...).
      if (this.opts.hookRunner?.has('PostToolUse')) {
        const post = await this.opts.hookRunner.postToolUse(
          tool.name,
          use.input,
          { content: String(settled.block.content), isError: !!settled.block.is_error },
          ctx,
        );
        if (post.additionalContext) {
          if (post.contextAs === 'separate') {
            ctx.pendingPostToolContext = ctx.pendingPostToolContext
              ? `${ctx.pendingPostToolContext}\n\n${post.additionalContext}`
              : post.additionalContext;
          } else {
            const appended = `\n\n${post.additionalContext}`;
            return {
              block: { ...settled.block, content: `${settled.block.content}${appended}` },
              bytes: settled.bytes + Buffer.byteLength(appended, 'utf8'),
            };
          }
        }
      }
      return settled;
    });
  }

  /**
   * PreToolUse ran for this call but the tool will not run (denied, rejected,
   * aborted, threw). Lets claim-releasing PostToolUse hooks undo what
   * PreToolUse took; see `HookRegistrationOptions.runWhenToolSkipped`.
   */
  async abandonTool(tool: Tool, use: ToolUseBlock, ctx: Context, reason: string): Promise<void> {
    await this.toolSkipped(tool, use, ctx, reason);
  }

  private async toolSkipped(
    tool: Tool,
    use: ToolUseBlock,
    ctx: Context,
    reason: string,
  ): Promise<void> {
    try {
      await this.opts.hookRunner?.toolSkipped(tool.name, use.input, reason, ctx);
    } catch {
      // Cleanup only; the call already has its result.
    }
  }

  private async produceToolOutput(
    tool: Tool,
    use: ToolUseBlock,
    ctx: Context,
    budgetHint: number,
  ): Promise<string> {
    this.opts.events?.emit('tool.started', {
      sessionId: resolveEventSessionId(ctx),
      ...(ctx.traceId ? { traceId: ctx.traceId } : {}),
      ...(ctx.activeLogicalRequestId ? { logicalRequestId: ctx.activeLogicalRequestId } : {}),
      ...(ctx.activePromptManifestId ? { promptManifestId: ctx.activePromptManifestId } : {}),
      agentId: ctx.agentId,
      agentName: ctx.agentName,
      name: tool.name,
      id: use.id,
      input: use.input,
      taskId: ctx.currentKanbanTaskId,
      boardId: ctx.currentKanbanBoardId,
      ...(typeof ctx.provider === 'object'
        ? { provider: (ctx.provider as { id: string }).id }
        : {}),
      ...(ctx.model ? { model: ctx.model } : {}),
    });
    this.opts.renderer?.writeToolCall(tool.name, use.input);
    const output = await this.runWithTimeout(tool, use.input, ctx.signal, ctx, use.id);
    const text = this.serializer.serialize(output, { toolName: tool.name, input: use.input, tool });
    const scrubbed = this.opts.secretScrubber.scrub(text);
    return tool.preserveFullOutput
      ? scrubbed
      : maybePersistLargeToolOutput(tool.name, scrubbed, budgetHint);
  }

  private settleToolOutput(
    tool: Tool,
    use: ToolUseBlock,
    text: string,
    budget: number,
  ): { block: ToolResultBlock; bytes: number } {
    const { text: capped, newBudget } = tool.preserveFullOutput
      ? {
          text,
          newBudget: Math.max(0, budget - Buffer.byteLength(text, 'utf8')),
        }
      : this.serializer.enforceCap(text, budget);
    this.hintRenderMode(tool.name);
    this.opts.renderer?.writeToolResult(tool.name, capped, false);
    return {
      block: {
        type: 'tool_result',
        tool_use_id: use.id,
        name: tool.name,
        content: capped,
        is_error: false,
      },
      bytes: budget - newBudget,
    };
  }

  private async runWithTimeout(
    tool: Tool,
    input: unknown,
    parentSignal: AbortSignal,
    ctx: Context,
    toolUseId?: string | undefined,
  ): Promise<unknown> {
    return runToolWithTimeout(
      tool,
      input,
      parentSignal,
      ctx,
      this.opts,
      {
        iterationTimeoutMs: this.iterationTimeoutMs,
        maxToolTimeoutMs: this.maxToolTimeoutMs,
        progressEmitIntervalMs: ToolExecutor.PROGRESS_EMIT_INTERVAL_MS,
        progressTailChars: ToolExecutor.PROGRESS_TAIL_CHARS,
        progressHeadChars: ToolExecutor.PROGRESS_HEAD_CHARS,
      },
      toolUseId,
    );
  }

  private budgetForString(content: string, budget: number): number {
    return Math.max(0, budget - Buffer.byteLength(content, 'utf8'));
  }
}
