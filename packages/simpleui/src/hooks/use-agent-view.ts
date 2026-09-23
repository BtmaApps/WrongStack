import { useMemo } from 'react';
import { aggregateFileEdits } from '../lib/timeline-model.js';
import { agentTranscriptToToolCalls } from '../lib/tool-model.js';
import type { ChatMessage, ToolCallInfo } from '../types.js';
import { useAgentRoster } from './use-agent-roster.js';
import type { UseModelCatalogResult } from './use-model-catalog.js';

export interface UseAgentViewOptions {
  running: boolean;
  messages: ChatMessage[];
  toolCalls: ToolCallInfo[];
  groupedModels: UseModelCatalogResult['groupedModels'];
  showModelReasoning: boolean;
}

/**
 * Agent-facing view state for the SimpleUI session: the subagent roster
 * (tabs, transcripts, leader selection) plus every projection derived from
 * it and the leader transcript — the thinking-filtered display messages,
 * the tool-call lane for the currently selected agent, file-edit
 * aggregation, and the flat provider/model pairs for subagent lane
 * selects. Extracted from `use-simple-ui-session.tsx` unchanged (facade
 * contract preserved).
 */
export function useAgentView({
  running,
  messages,
  toolCalls,
  groupedModels,
  showModelReasoning,
}: UseAgentViewOptions) {
  const {
    setSubagents,
    agentTranscripts,
    setAgentTranscripts,
    setSelectedAgentId,
    agentTabs,
    liveAgentTabs,
    finishedAgentTabs,
    activeAgentId,
    activeAgent,
    leaderSelected,
  } = useAgentRoster({ running });

  // Filter out thinking blocks when the user has disabled model reasoning display.
  const displayMessages = useMemo(
    () => (showModelReasoning ? messages : messages.filter((m) => m.role !== 'thinking')),
    [messages, showModelReasoning],
  );

  const selectedToolCalls = useMemo(
    () =>
      leaderSelected
        ? toolCalls
        : agentTranscriptToToolCalls(agentTranscripts[activeAgentId] ?? []),
    [activeAgentId, agentTranscripts, leaderSelected, toolCalls],
  );

  const { fileEditSummary, fileEdits } = useMemo(() => {
    const aggregate = aggregateFileEdits(toolCalls);
    return {
      fileEditSummary: aggregate,
      fileEdits: aggregate.files.map((edit) => ({ edit, ts: edit.ts ?? '' })),
    };
  }, [toolCalls]);

  // Flat provider/model pairs for the subagent lane selects in Settings. The
  // switcher's grouping is a display concern; a lane only needs the pair.
  const subagentModelOptions = useMemo(
    () =>
      groupedModels.flatMap(([provider, descriptors]) =>
        descriptors.map((descriptor) => ({ provider, model: descriptor.id })),
      ),
    [groupedModels],
  );

  return {
    displayMessages,
    selectedToolCalls,
    fileEditSummary,
    fileEdits,
    subagentModelOptions,
    setSubagents,
    agentTranscripts,
    setAgentTranscripts,
    setSelectedAgentId,
    agentTabs,
    liveAgentTabs,
    finishedAgentTabs,
    activeAgentId,
    activeAgent,
    leaderSelected,
  };
}
