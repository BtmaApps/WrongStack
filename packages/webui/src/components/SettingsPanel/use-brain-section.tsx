import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppTranslation } from '@/i18n';
import { useActiveSessionId } from '@/stores';
import type {
  BrainConfigPatchWire,
  BrainConfigWire,
  BrainCouncilVoterWire,
  WSServerMessage,
} from '@/types';
import {
  councilPersonaOptions,
  entryLabel,
  type PickTarget,
  RISK_LEVELS,
  type RiskLevel,
} from './brain-section-options';

export function useBrainSection() {
  const { t } = useAppTranslation();
  const { client } = useWebSocket();
  const [config, setConfig] = useState<BrainConfigWire | null>(null);
  const [log, setLog] = useState<
    Array<{ kind: string; question: string; outcome: string; age: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);

  // The Brain is project-wide; its DECISIONS are not. Each entry names the
  // session whose tool call it was about, and the server filters the log to
  // the session that asked. Asking untagged got this panel an unlabelled
  // mixture of all four open tabs' decisions.
  const sessionId = useActiveSessionId();

  // Fetch brain status + editable config on mount, and again when the tab in
  // front changes — the panel is parked, not unmounted, so without the re-ask
  // it keeps showing the previous tab's decisions.
  useEffect(() => {
    client.send({ type: 'brain.status', payload: client.withSession({}) });
    client.send({ type: 'brain.config.get' });
  }, [client, sessionId]);

  // Listen for brain status/config responses
  useEffect(() => {
    const offStatus = client.on('brain.status', (msg: WSServerMessage) => {
      const p = msg.payload as {
        maxAutoRisk: string;
        sessionId?: string | undefined;
        log: Array<{ at: number; kind: string; question: string; outcome: string }>;
      };
      // A stamped frame for another tab is not ours to render. Untagged stays
      // accepted: single-session hosts answer without a stamp.
      if (p.sessionId && sessionId && p.sessionId !== sessionId) return;
      const now = Date.now();
      setLog(
        p.log.slice(-10).map((entry) => {
          const s = Math.max(0, Math.round((now - entry.at) / 1000));
          const age =
            s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
          return { kind: entry.kind, question: entry.question, outcome: entry.outcome, age };
        }),
      );
      setLoading(false);
    });
    const offConfig = client.on('brain.config', (msg: WSServerMessage) => {
      const p = msg.payload as { config: BrainConfigWire; persisted: boolean; error?: string };
      setConfig(p.config);
      setPersistError(p.persisted ? null : (p.error ?? t('settings:brain.persistError')));
      setBusy(false);
      setLoading(false);
    });
    return () => {
      offStatus();
      offConfig();
    };
  }, [client, t, sessionId]);

  /** Every control funnels here: live-apply + persist on the server, reconcile on reply. */
  const sendPatch = useCallback(
    (patch: BrainConfigPatchWire) => {
      setBusy(true);
      // Stamped so the status frame the server sends back after applying the
      // patch comes home to this tab rather than the runtime's.
      client.send({ type: 'brain.config.set', payload: client.withSession({ patch }) });
    },
    [client],
  );

  const handleRiskChange = useCallback(
    (level: RiskLevel) => {
      setConfig((prev) => (prev ? { ...prev, maxAutoRisk: level } : prev));
      sendPatch({ maxAutoRisk: level });
    },
    [sendPatch],
  );

  const voters: BrainCouncilVoterWire[] = useMemo(() => config?.council.voters ?? [], [config]);

  const setVoters = useCallback(
    (next: BrainCouncilVoterWire[]) => {
      sendPatch({ council: { voters: next.length > 0 ? next : null } });
    },
    [sendPatch],
  );

  // Lens picker options come from the SERVER's persona registry, so a lens
  // added in core shows up here without touching this file. Older servers send
  // no catalog and fall back to the three lenses this section used to inline.
  const personaOptions = useMemo(
    () => councilPersonaOptions(config?.personaCatalog),
    [config?.personaCatalog],
  );

  const riskLevel: RiskLevel = (RISK_LEVELS as readonly string[]).includes(
    config?.maxAutoRisk ?? '',
  )
    ? ((config?.maxAutoRisk ?? 'medium') as RiskLevel)
    : 'medium';

  /** Shared picker resolution: route the selection to pool / voters / judge. */
  const handleModelPicked = useCallback(
    (candidate: { provider: string; model: string }): boolean | undefined => {
      if (!config || !pickTarget) return undefined;
      const ref = `${candidate.provider}/${candidate.model}`;
      if (pickTarget === 'pool') {
        sendPatch({ models: [...config.models.map(entryLabel), ref] });
        return undefined;
      }
      if (pickTarget === 'judge') {
        sendPatch({ council: { judge: ref } });
        return undefined;
      }
      // voter: multi-add — keep the dialog open until the user closes it.
      setVoters([
        ...voters,
        {
          provider: candidate.provider,
          model: candidate.model,
          persona: personaOptions[voters.length % personaOptions.length]?.id ?? 'executor',
        },
      ]);
      return true;
    },
    [config, personaOptions, pickTarget, sendPatch, setVoters, voters],
  );
  return {
    pickTarget,
    t,
    handleModelPicked,
    setPickTarget,
    loading,
    busy,
    persistError,
    riskLevel,
    handleRiskChange,
    config,
    sendPatch,
    voters,
    personaOptions,
    setVoters,
    log,
  };
}
