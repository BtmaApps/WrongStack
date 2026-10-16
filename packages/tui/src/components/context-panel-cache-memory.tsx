import type React from 'react';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import type { ContextPanelData } from './context-panel-types.js';
import { SectionLabel } from './monitor-shell.js';
import { fmtPct, fmtRatioPct } from './status-bar-format.js';

/**
 * Cache coverage section — answers "exactly how far does the prompt cache
 * extend into the live request?" Renders the last request's hit ratio (the
 * session-cumulative one next to it lags: it carries the cold first request
 * forever) plus a per-request coverage meter that visibly marks where the cached
 * prefix ends. Hidden when nothing has been cached yet so the panel does
 * not advertise a 0% figure as if it were meaningful.
 */
export function CacheSection({ data }: { data: ContextPanelData }): React.ReactElement {
  const cs = data.cacheStats ?? { readTokens: 0, writeTokens: 0, hitRatio: 0, savedUsd: 0 };
  const hasCache = cs.readTokens > 0 || cs.writeTokens > 0;
  // Anthropic-family providers (incl. MiniMax on the Anthropic surface) expose
  // the 5-min / 1-hour cache-write split. OpenAI-family gateways emit only
  // the aggregate and leave both undefined, in which case the panel skips
  // the TTL sub-row entirely instead of advertising two fabricated zeros.
  const hasTtlSplit = cs.cacheWrite5m !== undefined && cs.cacheWrite1h !== undefined;
  const coverage = Math.max(0, data.cacheCoverageTokens ?? 0);
  const max = data.ctxMaxTokens ?? 0;
  const covBarLen = 30;
  const covPct = max > 0 ? Math.min(100, (coverage / max) * 100) : 0;
  const covFilled = Math.round((covPct / 100) * covBarLen);

  return (
    <Box flexDirection="column" marginTop={1}>
      <SectionLabel>PROMPT CACHE</SectionLabel>

      <Box>
        <Text color={theme.textMuted}>{cs.last ? 'Last request ' : 'Hit ratio '}</Text>
        <Text color={hasCache ? theme.success : theme.textMuted} bold>
          {fmtRatioPct(cs.last?.hitRatio ?? cs.hitRatio)}
        </Text>
        {cs.last ? (
          <>
            <Text color={theme.textMuted}> · session </Text>
            <Text color={theme.textSecondary}>{fmtRatioPct(cs.hitRatio)}</Text>
          </>
        ) : null}
        <Text color={theme.textMuted}> · read </Text>
        <Text color={theme.textPrimary}>{cs.readTokens.toLocaleString('en-US')}</Text>
        <Text color={theme.textMuted}> · write </Text>
        <Text color={theme.textSecondary}>{cs.writeTokens.toLocaleString('en-US')}</Text>
        {cs.savedUsd > 0 ? (
          <>
            <Text color={theme.textMuted}> · saved </Text>
            <Text color={theme.success}>~${cs.savedUsd.toFixed(2)}</Text>
          </>
        ) : null}
      </Box>

      {hasTtlSplit ? (
        <Box>
          <Text color={theme.textMuted}>Write TTL </Text>
          <Text color={theme.textPrimary}>5m {(cs.cacheWrite5m ?? 0).toLocaleString('en-US')}</Text>
          <Text color={theme.textMuted}> · </Text>
          <Text color={theme.textSecondary}>
            1h {(cs.cacheWrite1h ?? 0).toLocaleString('en-US')}
          </Text>
        </Box>
      ) : null}

      {(data.providerCacheStats?.length ?? 0) > 0 ? (
        <Box flexDirection="column">
          <Text color={theme.textMuted}>Providers</Text>
          {data.providerCacheStats?.map((provider) => (
            <Text key={provider.provider}>
              <Text color={theme.textPrimary}> {provider.provider}</Text>
              <Text color={theme.textMuted}> · </Text>
              <Text color={provider.cacheRead > 0 ? theme.success : theme.textMuted}>
                {fmtRatioPct(provider.hitRatio)}
              </Text>
              <Text color={theme.textMuted}> · read </Text>
              <Text color={theme.textPrimary}>{provider.cacheRead.toLocaleString('en-US')}</Text>
              <Text color={theme.textMuted}> · write </Text>
              <Text color={theme.textSecondary}>{provider.cacheWrite.toLocaleString('en-US')}</Text>
              {provider.cacheWrite5m !== undefined && provider.cacheWrite1h !== undefined ? (
                <>
                  <Text color={theme.textMuted}> (</Text>
                  <Text color={theme.textPrimary}>
                    5m {provider.cacheWrite5m.toLocaleString('en-US')}
                  </Text>
                  <Text color={theme.textMuted}>, </Text>
                  <Text color={theme.textSecondary}>
                    1h {provider.cacheWrite1h.toLocaleString('en-US')}
                  </Text>
                  <Text color={theme.textMuted}>)</Text>
                </>
              ) : null}
            </Text>
          ))}
        </Box>
      ) : null}

      {coverage > 0 && max > 0 ? (
        <>
          {/* Coverage meter — `■` cells mark the cached span, `┊` line
              pins the exact endpoint. `□` shows the rest of the window
              that was billed at full input rate. */}
          <Box marginTop={1}>
            <Text color={theme.textMuted}>Coverage </Text>
            <Text color={theme.success}>{'■'.repeat(Math.max(0, covFilled))}</Text>
            <Text color={theme.textSecondary}>{'┊'}</Text>
            <Text color={theme.borderSubtle}>{'□'.repeat(Math.max(0, covBarLen - covFilled))}</Text>
            <Text color={theme.textMuted}> </Text>
            <Text color={theme.success}>
              {coverage.toLocaleString('en-US')} / {max.toLocaleString('en-US')} ({fmtPct(covPct)})
            </Text>
          </Box>
          <Text color={theme.textMuted}>
            The first {coverage.toLocaleString('en-US')} tokens of this prompt are served from the
            provider cache; everything after the marked boundary is fresh.
          </Text>
        </>
      ) : (
        <Text color={theme.textMuted}>
          No cached prefix on the current request — the next assistant turn will start building one.
        </Text>
      )}
    </Box>
  );
}

export function MemoryContextSection({ data }: { data: ContextPanelData }): React.ReactElement {
  const ctx = data.memoryContext;
  if (!ctx || (Object.keys(ctx.memories).length === 0 && ctx.transitions.length === 0)) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <SectionLabel>SAGE IN CONTEXT</SectionLabel>
        <Text color={theme.textMuted}>No memory has entered this session context.</Text>
      </Box>
    );
  }
  const records = Object.values(ctx.memories)
    .slice()
    .sort((a, b) => {
      if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt < a.lastSeenAt ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  let active = 0;
  let pending = 0;
  let exited = 0;
  for (const m of records) {
    if (m.state === 'active') active++;
    else if (m.state === 'injected') pending++;
    else exited++;
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <SectionLabel>SAGE IN CONTEXT</SectionLabel>
      <Text>
        <Text color={theme.success}>{`${active} ctx`}</Text>
        <Text color={theme.warn}>{` · ${pending} pending`}</Text>
        <Text color={theme.textMuted}>{` · ${exited} left · exact provider request snapshot`}</Text>
      </Text>
      {records.slice(0, 6).map((memory) => {
        const stateLabel =
          memory.state === 'active' ? 'CONTEXT' : memory.state === 'injected' ? 'PENDING' : 'LEFT';
        const arrow = memory.state === 'exited' ? '↳' : '↲';
        const stateColor =
          memory.state === 'active'
            ? theme.success
            : memory.state === 'injected'
              ? theme.warn
              : theme.textMuted;
        return (
          <Box key={memory.id} flexDirection="column" marginTop={1}>
            <Text>
              <Text color={stateColor}>{`${arrow} ${stateLabel.padEnd(7)}`}</Text>
              <Text color={theme.assistant}>{memory.id}</Text>
              <Text color={theme.textMuted}>{` [${memory.kind}] ${memory.persistence}`}</Text>
            </Text>
            <Text color={theme.textSecondary}>{memory.text}</Text>
          </Box>
        );
      })}
      {data.memoryContext.transitions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.textSecondary}>CAME / WENT</Text>
          {data.memoryContext.transitions.slice(0, 6).map((transition) => (
            <Text
              key={transition.id}
              color={transition.action === 'exited' ? theme.textMuted : theme.success}
            >
              {`${transition.action === 'exited' ? '↳' : '↲'} ${transition.action.padEnd(8)} ${transition.memoryId} · ${transition.reason}`}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
