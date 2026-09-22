import { color } from '@wrongstack/core/utils';

import { persistConfigSetting } from '../settings-menu.js';

export async function executeContextSettings(
  sub: string,
  rest: string[],
  persistDeps: Parameters<typeof persistConfigSetting>[0],
): Promise<{ message: string } | undefined> {
  if (sub === 'context-mode') {
    const raw = (rest[0] ?? '').toLowerCase();
    const modes = ['balanced', 'frugal', 'deep'];
    if (!modes.includes(raw)) {
      return {
        message: `${color.amber('Usage:')} /settings context-mode balanced|frugal|deep`,
      };
    }
    await persistConfigSetting(persistDeps, (cfg) => {
      const ctx = (cfg.context as Record<string, unknown>) ?? {};
      ctx.mode = raw;
      cfg.context = ctx;
    });
    return {
      message: `${color.green('✓')} context mode → ${color.cyan(raw)}   ${color.dim('context window policy')}`,
    };
  }

  if (sub === 'context-strategy') {
    const raw = (rest[0] ?? '').toLowerCase();
    const strategies = ['hybrid', 'intelligent', 'selective'];
    if (!strategies.includes(raw)) {
      return {
        message: `${color.amber('Usage:')} /settings context-strategy hybrid|intelligent|selective`,
      };
    }
    await persistConfigSetting(persistDeps, (cfg) => {
      const ctx = (cfg.context as Record<string, unknown>) ?? {};
      ctx.strategy = raw;
      cfg.context = ctx;
    });
    return {
      message: `${color.green('✓')} context strategy → ${color.cyan(raw)}   ${color.dim('compactor strategy')}`,
    };
  }

  if (sub === 'context-auto-compact') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings context-auto-compact on|off` };
    }
    const on = raw === 'on';
    await persistConfigSetting(persistDeps, (cfg) => {
      const ctx = (cfg.context as Record<string, unknown>) ?? {};
      ctx.autoCompact = on;
      cfg.context = ctx;
    });
    return {
      message: `${color.green('✓')} context auto-compact → ${on ? color.cyan('on') : color.dim('off')}   ${color.dim('auto-compact context when thresholds crossed')}`,
    };
  }

  if (sub === 'nextsteps-tool') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings nextsteps-tool on|off` };
    }
    const on = raw === 'on';
    await persistConfigSetting(persistDeps, (cfg) => {
      const tools = (cfg.tools as Record<string, unknown>) ?? {};
      tools.nextsteps = { enabled: on };
      cfg.tools = tools;
    });
    return {
      message: `${color.green('✓')} nextsteps tool → ${on ? color.cyan('on') : color.dim('off')}   ${color.dim('takes effect in the next session')}`,
    };
  }

  // ── Auto-thinning (tools.autoThin) ────────────────────────────────
  if (sub === 'autothin' || sub === 'auto-thin') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off', 'status'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings autothin on|off|status` };
    }
    if (raw === 'status') {
      return { message: 'Use `/tool autothin status` for the live read-out.' };
    }
    const on = raw === 'on';
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const tools = (cfg.tools as Record<string, unknown>) ?? {};
      const existing = (tools.autoThin as Record<string, unknown> | undefined) ?? {};
      tools.autoThin = { ...existing, enabled: on };
      cfg.tools = tools;
    });
    return {
      message: `${color.green('✓')} tools.autoThin.enabled → ${on ? color.cyan('true') : color.dim('false')}   ${color.dim('use /tool autothin candidates|apply|undo')}`,
    };
  }

  if (sub === 'autothin-idle') {
    const n = Number(rest[0]);
    if (!Number.isFinite(n) || n < 0) {
      return { message: `${color.amber('Usage:')} /settings autothin-idle <days>` };
    }
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const tools = (cfg.tools as Record<string, unknown>) ?? {};
      const existing = (tools.autoThin as Record<string, unknown> | undefined) ?? {};
      tools.autoThin = { ...existing, idleDays: n };
      cfg.tools = tools;
    });
    return { message: `${color.green('✓')} tools.autoThin.idleDays → ${color.cyan(String(n))}` };
  }

  if (sub === 'autothin-min') {
    const n = Number(rest[0]);
    if (!Number.isFinite(n) || n < 0) {
      return { message: `${color.amber('Usage:')} /settings autothin-min <count>` };
    }
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const tools = (cfg.tools as Record<string, unknown>) ?? {};
      const existing = (tools.autoThin as Record<string, unknown> | undefined) ?? {};
      tools.autoThin = { ...existing, minInvocations: n };
      cfg.tools = tools;
    });
    return {
      message: `${color.green('✓')} tools.autoThin.minInvocations → ${color.cyan(String(n))}`,
    };
  }

  if (sub === 'autothin-boot') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings autothin-boot on|off` };
    }
    const on = raw === 'on';
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const tools = (cfg.tools as Record<string, unknown>) ?? {};
      const existing = (tools.autoThin as Record<string, unknown> | undefined) ?? {};
      tools.autoThin = { ...existing, applyOnBoot: on };
      cfg.tools = tools;
    });
    return {
      message: `${color.green('✓')} tools.autoThin.applyOnBoot → ${on ? color.cyan('true') : color.dim('false')}`,
    };
  }

  if (sub === 'token-saving') {
    const raw = (rest[0] ?? '').toLowerCase();
    // `auto` belongs in this list: it is the shipped DEFAULT
    // (`config-loader/defaults.ts`), and omitting it meant a user who once
    // typed a concrete tier had no way back to the default from this command.
    const tiers = ['auto', 'off', 'minimal', 'light', 'medium', 'aggressive'];
    if (!tiers.includes(raw)) {
      return {
        message: `${color.amber('Usage:')} /settings token-saving auto|off|minimal|light|medium|aggressive`,
      };
    }
    await persistConfigSetting(persistDeps, (cfg) => {
      const feat = (cfg.features as Record<string, unknown>) ?? {};
      feat.tokenSavingMode = raw;
      cfg.features = feat;
    });
    // The tier is a session-start decision on purpose: the tool registry is
    // tiered once at boot, and the prompt builder latches its shape from the
    // same resolved value so the prefix stays byte-stable for the provider
    // cache. Saying so is the honest part - this used to print a bare tick
    // while nothing about the running session changed.
    return {
      message:
        `${color.green('✓')} token-saving → ${color.cyan(raw)}   ${color.dim('token-saving mode')}
` + color.dim('  Applies to the next session - the tool registry is tiered at startup.'),
    };
  }

  if (sub === 'max-concurrent') {
    const raw = rest[0];
    if (raw === undefined) {
      return {
        message: `${color.amber('Usage:')} /settings max-concurrent <n>   ${color.dim('(0 = default)')}`,
      };
    }
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) {
      return {
        message: `${color.red('Invalid number')}: "${raw}". Enter a non-negative integer (0 = default)`,
      };
    }
    await persistConfigSetting(persistDeps, (cfg) => {
      cfg.maxConcurrent = n;
    });
    return {
      message: `${color.green('✓')} max-concurrent → ${color.cyan(n === 0 ? 'default' : String(n))}   ${color.dim('max concurrent subagents')}`,
    };
  }
  return undefined;
}
