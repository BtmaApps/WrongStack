import { RESERVED_PROVIDER_IDS } from '@wrongstack/providers';
import { describe, expect, it } from 'vitest';
import { isExternalAgentProvider } from '../../core/src/coordination/external-agent-provider.js';
import { ACP_LEADER_PROVIDER_ID } from '../src/acp-leader/acp-leader-host.js';
import { WRONGFORGE_AGENT_ID } from '../src/fleet/wrongforge-client.js';

/**
 * The provider ids users may not take are exactly the ones the host routes to
 * built-in runners. A new system provider must be added to both lists, or a
 * user profile could claim its name and shadow it.
 */
describe('reserved provider ids', () => {
  it('cover the host-owned ACP and WrongForge providers', () => {
    expect([...RESERVED_PROVIDER_IDS].sort()).toEqual(
      [ACP_LEADER_PROVIDER_ID, WRONGFORGE_AGENT_ID].sort(),
    );
    for (const id of RESERVED_PROVIDER_IDS) expect(isExternalAgentProvider(id)).toBe(true);
  });
});
