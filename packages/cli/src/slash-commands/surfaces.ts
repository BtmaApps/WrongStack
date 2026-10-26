import type { SlashCommand } from '@wrongstack/contracts/types';

const WEBUI_MESSAGE = [
  'WrongStack Web UI',
  '─'.repeat('WrongStack Web UI'.length),
  'The Web UI is the browser-based view for sessions, agents, mailbox coordination, and project activity.',
  '',
  'Recommended path:',
  '  Start the Web UI/HQ server with the project command you normally use, then open the printed local URL in your browser.',
  '',
  'Why this command only explains:',
  '  The active slash-command surface may not know which port, host, or Web UI package is running. Showing guidance is more reliable than guessing and opening the wrong target.',
].join('\n');

export function buildWebuiCommand(): SlashCommand {
  return {
    name: 'webui',
    aliases: ['web'],
    category: 'App',
    description: 'Explain how to access the WrongStack browser UI.',
    help: [
      'Usage:',
      '  /webui',
      '  /web',
      '',
      'Shows Web UI access guidance without guessing whether a local server is already running.',
    ].join('\n'),
    async run() {
      return { message: WEBUI_MESSAGE };
    },
  };
}
