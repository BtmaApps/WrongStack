import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { atomicWrite, toErrorMessage } from '@wrongstack/core/utils';
import { createHeadlessLaunchPlan, runDockerWorkspace } from '@wrongstack/runtime';
import type { TerminalRenderer } from '../../renderer.js';
import type { SubcommandHandler } from '../contracts.js';

export const sandboxCmd: SubcommandHandler = (args, deps) =>
  runSandboxCommand(args, deps.flags ?? {}, deps.renderer);

const USAGE = `Usage: wstack sandbox docker --image <trusted-image> --prompt <task> [options]

Runs the entire WrongStack agent in a copied Docker workspace. Your local project
and home are not mounted. Returns a patch against the imported snapshot; nothing
is automatically applied to your working tree.

Build the supplied runtime image from a published version:
  docker build --build-arg WRONGSTACK_VERSION=<version> -t wrongstack-sandbox containers/sandbox

Options:
  --image <image>        Required image with wstack, git and sh installed
  --prompt <task>        Required task for the isolated agent
  --provider <id>        Provider to use inside the container
  --model <id>           Model to use inside the container
  --env <NAME,...>       Explicit host env names to forward (no values on argv)
  --network <bridge|none> Docker networking (default bridge)
  --timeout <seconds>    Entire agent command limit (default 600)
  --out <directory>      Patch and run metadata directory
  --yolo                Enable YOLO inside this container only
  --max-iterations <n>  Agent iteration limit (default 40, maximum 1000)
  --dry-run             Validate and print a plan without starting Docker
  --help                Show this help

Binary/image previews and OAuth credential-file import are not part of this
launcher. Use API credentials forwarded explicitly, or a separately configured
trusted image. The default image and packages are never silently selected.
`;

export async function runSandboxCommand(
  args: string[],
  flags: Record<string, string | boolean>,
  renderer: TerminalRenderer,
): Promise<number> {
  if (flags['help'] || args[0] === 'help') {
    renderer.write(USAGE);
    return 0;
  }
  const image = typeof flags['image'] === 'string' ? flags['image'] : '';
  const prompt = typeof flags['prompt'] === 'string' ? flags['prompt'] : '';
  if (args[0] !== 'docker' || !image || !prompt) {
    renderer.write(USAGE);
    return 2;
  }
  const network = flags['network'] ?? 'bridge';
  if (network !== 'bridge' && network !== 'none') {
    renderer.write('sandbox: network must be bridge or none\n');
    return 2;
  }
  const timeoutMs = Number(flags['timeout'] ?? 600) * 1000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 86_400_000) {
    renderer.write('sandbox: timeout must be 1 to 86400 seconds\n');
    return 2;
  }
  const envNames =
    typeof flags['env'] === 'string'
      ? flags['env']
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const plan = createHeadlessLaunchPlan({
      name: 'sandbox',
      projectRoot: process.cwd(),
      image,
      prompt,
      provider: typeof flags['provider'] === 'string' ? flags['provider'] : undefined,
      model: typeof flags['model'] === 'string' ? flags['model'] : undefined,
      envNames,
      yolo: flags['yolo'] === true,
      enabled: true,
      timeoutMs,
      maxIterations: flags['max-iterations'] === undefined ? 40 : Number(flags['max-iterations']),
    });
    if (flags['dry-run'] === true) {
      renderer.write(
        `${JSON.stringify({ ...plan, network, missingEnvironment: envNames.filter((name) => !process.env[name]) }, null, 2)}\n`,
      );
      return 0;
    }
    const result = await runDockerWorkspace({
      projectRoot: process.cwd(),
      image,
      command: 'wstack',
      args: plan.args,
      envNames,
      network,
      timeoutMs,
      signal: abort.signal,
      onOutput: (text) => renderer.write(text),
    });
    const out = path.resolve(
      typeof flags['out'] === 'string'
        ? flags['out']
        : path.join(process.cwd(), '.wrongstack', 'sandbox-runs', result.id),
    );
    await mkdir(out, { recursive: true });
    if (result.patch !== null) await atomicWrite(path.join(out, 'changes.patch'), result.patch);
    const { patch: _patch, output: _output, ...metadata } = result;
    await atomicWrite(
      path.join(out, 'run.json'),
      `${JSON.stringify({ ...metadata, image, projectRoot: process.cwd(), network }, null, 2)}\n`,
    );
    renderer.write(
      `\nSandbox exit: ${result.exitCode}\n${result.patch !== null ? `Patch: ${path.join(out, 'changes.patch')}\n` : `Partial workspace: wrongstack-${result.id}\n`}Metadata: ${path.join(out, 'run.json')}\n`,
    );
    if (result.cleanup === 'retained')
      renderer.write('Stopped container retained for recovery; no patch was claimed.\n');
    if (result.cleanup === 'unverified')
      renderer.write(`Container cleanup could not be verified: wrongstack-${result.id}\n`);
    return result.exitCode;
  } catch (error) {
    renderer.write(`sandbox: ${toErrorMessage(error)}\n`);
    return abort.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}
