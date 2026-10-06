import type { resolveControllerProps } from './controller-props.js';
import { useAppState } from './hooks/use-app-state.js';

/**
 * App state facade (`useAppState`) seeded from the resolved controller props.
 */
export function useControllerAppState({
  controllerProps,
}: {
  controllerProps: ReturnType<typeof resolveControllerProps>;
}) {
  const { state, dispatch, layoutStore, liveTodos } = useAppState({
    agent: controllerProps.agent,
    banner: controllerProps.banner,
    appVersion: controllerProps.appVersion,
    provider: controllerProps.provider,
    model: controllerProps.model,
    family: controllerProps.family,
    keyTail: controllerProps.keyTail,
    profile: controllerProps.profile,
    profileConfigPath: controllerProps.profileConfigPath,
    autonomyAgents: controllerProps.autonomyAgents,
    restoredMessages: controllerProps.restoredMessages,
    restoredToolCalls: controllerProps.restoredToolCalls,
    restoredEvents: controllerProps.restoredEvents,
    enhanceEnabled: controllerProps.enhanceEnabled,
    initialAgentsMonitorOpen: controllerProps.initialAgentsMonitorOpen,
    initialFleetChat: controllerProps.fleetStreamController?.mode,
    sessionsDir: controllerProps.sessionsDir,
  });
  return { state, dispatch, layoutStore, liveTodos };
}
