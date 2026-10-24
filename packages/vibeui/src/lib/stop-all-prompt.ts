/** Copy for the Stop all confirmation. Names the agents the click will stop. */
export function stopAllPrompt(
  leaderRunning: boolean,
  agentNames: readonly string[],
): { title: string; body: string } {
  const names = agentNames.map((name) => name.trim()).filter((name) => name.length > 0);
  const listed = names.slice(0, 6).join(', ');
  const extra = names.length > 6 ? ` and ${names.length - 6} more` : '';
  const agents =
    names.length === 0
      ? ''
      : names.length === 1
        ? `This agent is still running: ${listed}.`
        : `These agents are still running: ${listed}${extra}.`;
  const leader = leaderRunning
    ? 'The leader is still working.'
    : 'The leader has finished, but work is still going.';
  return {
    title: 'Stop the leader and all agents?',
    body: [
      leader,
      agents,
      'Stop all ends the leader and every agent listed here. Queued messages stay paused.',
    ]
      .filter((part) => part.length > 0)
      .join(' '),
  };
}
