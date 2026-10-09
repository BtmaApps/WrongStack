import type { SlashCommand } from '@wrongstack/core/types';
import {
  browserInstallationDiagnostics,
  browserPrivateOrigins,
  installBrowserRuntime,
  setBrowserPrivateOrigin,
} from '@wrongstack/tools/browser';

const HELP = [
  '/browser                         Show browser setup and allowed private origins',
  '/network                         Alias; origin allowances also cover fetch and read_url_content',
  '/browser install                 Install Chromium now (also automatic on first open)',
  '/browser allow <origin>          Allow an exact origin in this project, immediately',
  '/browser remove <origin>         Remove a project origin allowance',
  'Example: /browser allow http://localhost:3000',
  'Loopback shorthand is supported: /network allow localhost:3000',
  'Origins supplied by WRONGSTACK_BROWSER_PRIVATE_ORIGINS stay managed by the environment.',
].join('\n');

export function buildBrowserCommand(): SlashCommand {
  return {
    name: 'browser',
    aliases: ['network'],
    category: 'Config',
    description:
      'Manage browser setup and project origins shared by browser, fetch and read_url_content.',
    argsHint: '[install|allow|remove] [origin]',
    help: HELP,
    async run(args, ctx) {
      const root = ctx?.projectRoot ?? ctx?.cwd ?? process.cwd();
      const [action, origin, ...extra] = args.trim().split(/\s+/);
      try {
        if (!action || action === 'status') {
          const status = await browserInstallationDiagnostics();
          const origins = browserPrivateOrigins(root);
          return {
            message: `${status.message}\nAllowed private origins: ${origins.join(', ') || '(none)'}\n${HELP}`,
          };
        }
        if (action === 'install' && !origin) {
          await installBrowserRuntime();
          return { message: 'Chromium installed and ready.' };
        }
        if ((action === 'allow' || action === 'remove') && origin && extra.length === 0) {
          const normalizedOrigin = /^(?:localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/i.test(origin)
            ? `http://${origin}`
            : origin;
          const origins = await setBrowserPrivateOrigin(root, normalizedOrigin, action === 'allow');
          return {
            message: `Network project policy saved. Allowed private origins: ${origins.join(', ') || '(none)'}.`,
          };
        }
        return { message: HELP };
      } catch (error) {
        return {
          message: `Browser setup failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
