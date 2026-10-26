// Reuse WrongStack's backend services and protocol, never its web frontend.
import { version } from '../package.json';

if (process.argv.includes('--version')) {
  console.log(`WrongStack desktop engine ${version}`);
  process.exit(0);
}

const portIndex = process.argv.indexOf('--port');
const port = Number(process.argv[portIndex + 1]);
const accessToken = process.env['WEBUI_TOKEN'];
const distDir = process.env['WRONGSTACK_DESKTOP_EMPTY_DIST'];
if (!Number.isInteger(port) || port < 1 || port > 65535 || !accessToken || !distDir) {
  throw new Error(
    'Desktop engine requires a valid port, private token, and disabled frontend directory.',
  );
}
const { hardenWin32ExecutableSearch } = await import('@wrongstack/core/utils');
hardenWin32ExecutableSearch();
const { startWebUI } = await import('@wrongstack/webui-server');
await startWebUI({
  wsHost: '127.0.0.1',
  httpPort: port,
  accessToken,
  requireToken: true,
  distDir,
  open: false,
});
