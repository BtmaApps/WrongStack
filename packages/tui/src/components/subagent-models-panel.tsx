import type React from 'react';
import { Box, Text } from '../ink.js';
import type { SubagentLaneView, SubagentRoleView } from '../ui-contracts.js';

/**
 * Per-session subagent model lanes — the panel behind `/subagent-models`.
 *
 * One row per lane: the Nth subagent running at any moment takes the Nth free
 * lane, so a fan-out of 8 workers runs on 8 different provider/model pairs.
 * Editing a row reuses the shared two-step model picker (`requestModelPick`),
 * which is why this component carries no provider list of its own.
 */

export interface SubagentModelsPanelProps {
  lanes: SubagentLaneView[];
  roles: SubagentRoleView[];
  selected: number;
  enabled: boolean;
  lock: boolean;
  followSessionModel: boolean;
  sessionTarget: string;
  hint?: string | undefined;
  maxRows?: number | undefined;
}

export function SubagentModelsPanel({
  lanes,
  roles,
  selected,
  enabled,
  lock,
  followSessionModel,
  sessionTarget,
  hint,
  maxRows = 24,
}: SubagentModelsPanelProps): React.ReactElement {
  const compact = maxRows < 14;
  const roleLimit = compact ? 0 : Math.min(roles.length, Math.max(0, maxRows - 15));
  const maxVisible = Math.max(
    1,
    maxRows -
      (compact ? 7 : 11) -
      (followSessionModel && !compact ? 1 : 0) -
      (roleLimit ? roleLimit + 3 : 0),
  );
  // Keep the focused lane on screen for a long lane list.
  const windowStart = Math.max(
    0,
    Math.min(selected - Math.floor(maxVisible / 2), lanes.length - maxVisible),
  );
  const start = Math.max(0, windowStart);
  const visible = lanes.slice(start, start + maxVisible);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Text bold color="blue" wrap="truncate-end">
        ━━ Subagent models (this session) ━━
      </Text>
      <Text dimColor wrap="truncate-end">
        {compact
          ? 'Esc · ↑↓ · Enter · c/l/s · Space'
          : 'Esc close · ↑↓ move · Enter set model · c clear · l lock · s session model · space on/off'}
      </Text>

      <Box marginTop={compact ? 0 : 1}>
        <Text wrap="truncate-end">
          <Text bold>Plan: </Text>
          {enabled ? <Text color="green">● on</Text> : <Text color="gray">○ off</Text>}
          <Text dimColor>{'   '}</Text>
          <Text bold>Lock: </Text>
          {lock ? <Text color="green">on</Text> : <Text color="gray">off</Text>}
          <Text dimColor>
            {compact
              ? ` · session:${followSessionModel ? 'on' : 'off'}`
              : lock
                ? '  (lanes override the leader)'
                : '  (leader pins win; lanes fill gaps)'}
          </Text>
        </Text>
      </Box>

      {!compact ? (
        <Text wrap="truncate-end">
          <Text bold>Use session model: </Text>
          {followSessionModel ? <Text color="green">on</Text> : <Text color="gray">off</Text>}
          {followSessionModel ? (
            <Text dimColor>{`  every plain subagent → ${sessionTarget}`}</Text>
          ) : null}
        </Text>
      ) : null}

      <Box marginTop={compact ? 0 : 1} flexDirection="column">
        {followSessionModel && !compact ? (
          <Text dimColor>lanes are inactive while "use session model" is on</Text>
        ) : null}
        {visible.map((lane, i) => {
          const index = start + i;
          const focused = index === selected;
          return (
            <Text key={`lane-${index}`} wrap="truncate-end">
              <Text color={focused ? 'cyan' : undefined}>{focused ? '❯ ' : '  '}</Text>
              <Text color={lane.busy > 0 ? 'green' : 'gray'}>{lane.busy > 0 ? '●' : '○'}</Text>
              <Text dimColor>{` ${String(index + 1).padStart(2)} `}</Text>
              <Text color={lane.target ? 'cyan' : undefined} dimColor={!lane.target}>
                {lane.target || '(inherit — matrix / tier / session)'}
              </Text>
              {lane.label ? <Text dimColor>{`  ${lane.label}`}</Text> : null}
            </Text>
          );
        })}
      </Box>

      {lanes.length > maxVisible ? (
        <Text
          dimColor
        >{`  ${start + 1}–${start + visible.length}/${lanes.length} lanes${roles.length ? ` · ${roles.length} roles` : ''}`}</Text>
      ) : null}

      {roleLimit > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Role overrides</Text>
          <Text dimColor>beat the lanes and consume none</Text>
          {roles.slice(0, roleLimit).map((role) => (
            <Text key={`role-${role.role}`} wrap="truncate-end">
              <Text dimColor>{`    ${role.role.padEnd(20)} → `}</Text>
              <Text color="cyan">{role.target}</Text>
            </Text>
          ))}
        </Box>
      ) : null}

      <Box marginTop={compact ? 0 : 1}>
        <Text dimColor wrap="truncate-end">
          {hint ?? 'Scoped to this session and restored by /resume — config.json is untouched.'}
        </Text>
      </Box>
    </Box>
  );
}
