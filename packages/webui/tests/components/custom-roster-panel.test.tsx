import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rosterMocks = vi.hoisted(() => ({ sendRosterMessage: vi.fn() }));

vi.mock('@/lib/roster-ws', () => ({ sendRosterMessage: rosterMocks.sendRosterMessage }));

import { CustomRosterPanel } from '../../src/components/CustomRosterPanel.js';

const architect = {
  role: 'architect',
  exists: true,
  entryCount: 5,
  totalBytes: 1200,
  lastCapture: null,
  cooldownRemainingMs: 0,
  sessionCaptureCount: 1,
  needsSummarization: false,
  hasIdentity: true,
  hasConfig: true,
  hasKnowledge: false,
};

describe('CustomRosterPanel', () => {
  beforeEach(() => {
    rosterMocks.sendRosterMessage.mockReset();
    rosterMocks.sendRosterMessage.mockImplementation(async (type: string) => {
      if (type === 'agent-roster.list') return { roles: ['architect'], stats: [architect] };
      if (type === 'agent-roster.conflicts') {
        return { conflicts: [{ roleA: 'architect', roleB: 'reviewer', similarity: 0.88 }] };
      }
      if (type === 'agent-roster.stats') return architect;
      if (type === 'agent-roster.llm-improve') {
        return { instruction: 'Improve architecture diagram guidelines' };
      }
      if (type === 'agent-roster.append-learned') return { success: true, path: 'learned.md' };
      if (type === 'agent-roster.capture') return { captured: 1 };
      return { success: true };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state initially and then displays roster roles and details', async () => {
    render(<CustomRosterPanel projectRoot="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText('architect')).toBeTruthy();
    });

    expect(screen.getByText('1200B')).toBeTruthy();

    // Select the architect role
    const roleBtn = screen.getByRole('button', { name: /architect/i });
    fireEvent.click(roleBtn);

    // Detail header and stats
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'architect' })).toBeTruthy();
    });

    // Check action buttons in header (capture, reset)
    expect(screen.getByTitle(/Capture learned|captureLearned/i)).toBeTruthy();
    expect(screen.getByTitle(/Reset/i)).toBeTruthy();
  });

  it('allows teaching the agent new behaviors', async () => {
    const { container } = render(<CustomRosterPanel projectRoot="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText('architect')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /architect/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'architect' })).toBeTruthy();
    });

    // Teach textarea is the first textarea on the page
    const textareas = container.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(textareas[0], {
      target: { value: 'Always enforce hexagonal architecture' },
    });

    const teachBtn = screen.getByRole('button', { name: /Teach/i });
    fireEvent.click(teachBtn);

    await waitFor(() => {
      expect(rosterMocks.sendRosterMessage).toHaveBeenCalledWith(
        'agent-roster.append-learned',
        expect.objectContaining({ role: 'architect' }),
      );
    });
  });

  it('allows running LLM improve suggestions', async () => {
    const { container } = render(<CustomRosterPanel projectRoot="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText('architect')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /architect/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'architect' })).toBeTruthy();
    });

    // LLM improve textarea is the second textarea on the page
    const textareas = container.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(textareas[1], {
      target: { value: 'Add strict review checks' },
    });

    const improveBtn = screen.getByRole('button', { name: /Improve/i });
    fireEvent.click(improveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Improve architecture diagram guidelines/i)).toBeTruthy();
    });
  });

  it('renders empty state when there are no customized roles', async () => {
    rosterMocks.sendRosterMessage.mockResolvedValueOnce({ roles: [], stats: [] });

    render(<CustomRosterPanel projectRoot="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText(/No Custom Roster Agents/i)).toBeTruthy();
    });

    expect(screen.getByText(/Create executor identity/i)).toBeTruthy();
  });

  it('renders error state when WebSocket connection is not available', async () => {
    rosterMocks.sendRosterMessage.mockRejectedValue(new Error('WebSocket not connected'));

    render(<CustomRosterPanel projectRoot="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText(/WebSocket not connected/i)).toBeTruthy();
    });
  });
});
