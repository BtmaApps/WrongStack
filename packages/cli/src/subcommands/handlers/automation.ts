import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import {
  atomicWrite,
  toErrorMessage,
  withFileLock,
  wstackGlobalRoot,
} from '@wrongstack/core/utils';
import type { CredentialReference } from '@wrongstack/runtime';
import {
  AutomationService,
  AutomationStore,
  createAutomationServer,
  createHeadlessLaunchPlan,
  evaluateGitHubFilters,
} from '@wrongstack/runtime';
import {
  exportAutomationJob,
  importAutomationJob,
  VERSIONED_AUTOMATION_TEMPLATES,
} from '@wrongstack/webui-protocol';
import type { SubcommandHandler } from '../contracts.js';
import { resolveAutomationCredentialBundle } from './automation-credentials.js';

const USAGE = `Usage: wstack automation <add|preview|templates|import|export|list|run|enable|disable|cancel|serve|prune> [id] [options]

Persistent agent jobs and run history. Jobs execute in a copied Docker workspace
and produce reviewable patches. No host project edits or automatic publishing.

add --name <name> --image <trusted-image> --prompt <task>
    [--every <seconds>] [--provider <id>] [--model <id>] [--env NAME,...]
    [--repository owner/repo --events issue_comment.created,pull_request.opened]
    [--webhook-secret-env GITHUB_WEBHOOK_SECRET] [--timeout <seconds>]
    [--credential ENV=provider/key-label] [--yolo] [--max-iterations <n>]
    [--cron "0 9 * * 1-5" --timezone Europe/Istanbul]
    [--mention @wrongstack] [--label agent] [--branch main]
    [--conclusion failure] [--exclude-bots] [--exclude-drafts]
preview               Same options as add; validate without writing or executing
    [--event-file <json>] Preview GitHub conditions against a sample payload
templates             List versioned templates and required setup
add --template <id>   Use a versioned prompt template with existing project instructions/skills
export <id>           Print a portable definition without project identity or credential values
import --file <json>  Import into this project, disabled and with unattended tools off
    [--dry-run] Validate the import without writing a job
run <id>              Queue a manual run
list                  Show persistent jobs and run status
enable|disable <id>   Change scheduling state
cancel <run-id>       Cancel a queued run (running cancellation uses the API)
prune --days <n>      Prune old terminal metadata; retain latest PR checkpoints and artifacts
serve [--port 3501]   Start worker and loopback HTTP API until interrupted
--data-dir <path>     Explicit state directory (default machine home/automation)

The API token is stored in token.txt, not printed. GitHub POSTs use
/hooks/<job-id>/github and HMAC-SHA256 verification. Control routes require
Bearer authentication; manual run POSTs require an Idempotency-Key.
Choose --every (fixed seconds) or --cron (five fields, timezone defaults to UTC).
Preview and add --dry-run print references only; values are resolved at execution.
`;

async function apiToken(directory: string): Promise<string> {
  const file = path.join(directory, 'token.txt');
  return withFileLock(file, async () => {
    try {
      const value = (await readFile(file, 'utf8')).trim();
      if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid automation API token file');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const value = randomBytes(32).toString('hex');
      await atomicWrite(file, `${value}\n`, { mode: 0o600 });
      return value;
    }
  });
}

export const automationCmd: SubcommandHandler = async (args, deps) => {
  const flags = deps.flags ?? {};
  const action = args[0] ?? 'list';
  if (flags['help'] || action === 'help') {
    deps.renderer.write(USAGE);
    return 0;
  }
  const value = (name: string) =>
    typeof flags[name] === 'string' ? (flags[name] as string) : undefined;
  const directory = path.resolve(value('data-dir') ?? path.join(wstackGlobalRoot(), 'automation'));
  const store = new AutomationStore(directory);
  try {
    if (action === 'add' || action === 'preview') {
      const template = value('template')
        ? VERSIONED_AUTOMATION_TEMPLATES.find((item) => item.id === value('template'))
        : undefined;
      if (value('template') && !template) throw new Error('Unknown automation template');
      if (value('timezone') && !value('cron')) throw new Error('--timezone requires --cron');
      const credentials: CredentialReference[] | undefined = value('credential')
        ?.split(',')
        .map((item) => {
          const equal = item.indexOf('=');
          const envName = item.slice(0, equal).trim();
          const keyPath = item.slice(equal + 1).split('/');
          if (equal < 1 || keyPath.length < 2)
            throw new Error('Use --credential ENV=provider/key-label');
          return {
            envName,
            profile: deps.paths.profileName,
            provider: keyPath[0]!,
            keyLabel: keyPath.slice(1).join('/'),
          };
        });
      const spec = {
        name: value('name') ?? template?.name ?? '',
        projectRoot: deps.projectRoot,
        image: value('image') ?? '',
        prompt: value('prompt') ?? template?.prompt ?? '',
        template: template ? { id: template.id, version: template.version } : undefined,
        provider: value('provider'),
        model: value('model'),
        envNames:
          value('env')
            ?.split(',')
            .map((name) => name.trim())
            .filter(Boolean) ?? [],
        intervalMs: value('every') === undefined ? undefined : Number(value('every')) * 1000,
        schedule: value('cron')
          ? {
              type: 'cron' as const,
              expression: value('cron')!,
              timezone: value('timezone') ?? 'UTC',
            }
          : undefined,
        enabled: true,
        yolo: flags['yolo'] === true,
        timeoutMs: Number(value('timeout') ?? 600) * 1000,
        maxIterations: Number(value('max-iterations') ?? 40),
        credentials,
        github: value('repository')
          ? {
              repository: value('repository')!,
              events: value('events')
                ?.split(',')
                .map((event) => event.trim()) ?? ['issue_comment.created'],
              secretEnv: value('webhook-secret-env') ?? 'GITHUB_WEBHOOK_SECRET',
              filters: {
                mention: value('mention'),
                label: value('label'),
                branch: value('branch'),
                conclusion: value('conclusion'),
                draft: flags['exclude-drafts'] === true ? false : undefined,
                excludeBots: flags['exclude-bots'] === true ? true : undefined,
              },
            }
          : undefined,
      };
      const plan = createHeadlessLaunchPlan(spec);
      if (action === 'preview' || flags['dry-run'] === true) {
        const missing: string[] = spec.envNames.filter((name) => !process.env[name]);
        for (const ref of spec.credentials ?? []) {
          try {
            const profile = JSON.parse(
              (await readFile(deps.paths.profileConfig(ref.profile), 'utf8')).replace(
                /^\uFEFF/,
                '',
              ),
            );
            const provider =
              profile.providers && Object.hasOwn(profile.providers, ref.provider)
                ? profile.providers[ref.provider]
                : undefined;
            const key = provider?.apiKeys?.find(
              (entry: { label: string }) => entry.label === ref.keyLabel,
            );
            if (!key?.apiKey || (key.authMethod && key.authMethod !== 'api_key'))
              missing.push(`${ref.profile}/${ref.provider}/${ref.keyLabel}`);
          } catch {
            missing.push(`${ref.profile}/${ref.provider}/${ref.keyLabel}`);
          }
        }
        const filterPreview = value('event-file')
          ? evaluateGitHubFilters(
              spec.github?.filters,
              JSON.parse(await readFile(value('event-file')!, 'utf8')),
            )
          : undefined;
        deps.renderer.write(
          `${JSON.stringify({ ...plan, missingReferences: missing, filterPreview }, null, 2)}\n`,
        );
        return 0;
      }
      const job = await store.add(spec);
      deps.renderer.write(`Automation: ${job.id}\n`);
      return 0;
    }
    if (action === 'list') {
      deps.renderer.write(`${JSON.stringify(await store.snapshot(), null, 2)}\n`);
      return 0;
    }
    if (action === 'templates') {
      deps.renderer.write(`${JSON.stringify(VERSIONED_AUTOMATION_TEMPLATES, null, 2)}\n`);
      return 0;
    }
    if (action === 'export' && args[1]) {
      const job = (await store.snapshot()).jobs.find((item) => item.id === args[1]);
      if (!job) throw new Error('Automation job not found');
      deps.renderer.write(`${JSON.stringify(exportAutomationJob(job), null, 2)}\n`);
      return 0;
    }
    if (action === 'import' && value('file')) {
      const raw = await readFile(path.resolve(deps.cwd, value('file')!), 'utf8');
      if (Buffer.byteLength(raw) > 128 * 1024)
        throw new Error('Automation document exceeds 128 KB');
      const spec = { ...importAutomationJob(JSON.parse(raw)), projectRoot: deps.projectRoot };
      const plan = createHeadlessLaunchPlan(spec);
      if (flags['dry-run']) deps.renderer.write(`${JSON.stringify(plan, null, 2)}\n`);
      else deps.renderer.write(`Imported disabled job: ${(await store.add(spec)).id}\n`);
      return 0;
    }
    if (action === 'run' && args[1]) {
      const run = await store.enqueue(args[1]);
      deps.renderer.write(`Queued: ${run.id}\n`);
      return 0;
    }
    if ((action === 'enable' || action === 'disable') && args[1]) {
      await store.setEnabled(args[1], action === 'enable');
      return 0;
    }
    if (action === 'cancel' && args[1]) {
      await store.cancel(args[1]);
      return 0;
    }
    if (action === 'prune') {
      const days = Number(value('days') ?? 30);
      if (!Number.isFinite(days) || days < 0) throw new Error('Prune days must be nonnegative');
      const count = await store.prune(Date.now() - days * 86_400_000);
      deps.renderer.write(
        `Pruned terminal metadata: ${count}\nArtifacts and latest PR checkpoints retained.\n`,
      );
      return 0;
    }
    if (action !== 'serve') {
      deps.renderer.write(USAGE);
      return 2;
    }
    const port = Number(value('port') ?? 3501);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
      throw new Error('Automation port must be 1 to 65535');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const token = await apiToken(directory);
    const service = new AutomationService(
      store,
      undefined,
      Number(value('max-concurrent') ?? 1),
      (refs) => resolveAutomationCredentialBundle(refs, deps.paths, deps.vault),
    );
    const server = createAutomationServer(service, token, (profile) =>
      deps.paths.profileConfig(profile),
    );
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    deps.renderer.write(
      `Automation: http://127.0.0.1:${port}\nToken file: ${path.join(directory, 'token.txt')}\n`,
    );
    const abort = new AbortController();
    const cancel = () => abort.abort();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
      const endpointFile = path.join(directory, 'endpoint.json');
      await withFileLock(endpointFile, () =>
        atomicWrite(endpointFile, JSON.stringify({ port, workerId: service.workerId }), {
          mode: 0o600,
        }),
      );
      let lastTickError: string | undefined;
      while (!abort.signal.aborted) {
        try {
          await service.tick();
          lastTickError = undefined;
        } catch (error) {
          // One failed tick (unreadable state, lock timeout) must not stop the
          // worker and abort the runs in flight; report it once, retry next tick.
          const message = toErrorMessage(error);
          if (message !== lastTickError) deps.renderer.write(`automation: ${message}\n`);
          lastTickError = message;
        }
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            abort.signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, 1000);
          abort.signal.addEventListener('abort', done, { once: true });
          if (abort.signal.aborted) done();
        });
      }
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      try {
        await service.stop();
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        try {
          const endpointFile = path.join(directory, 'endpoint.json');
          await withFileLock(endpointFile, async () => {
            if (JSON.parse(await readFile(endpointFile, 'utf8')).workerId === service.workerId)
              await unlink(endpointFile);
          });
        } catch {
          /* Unknown descriptor ownership never authorizes deletion. */
        }
      }
    }
    return 0;
  } catch (error) {
    deps.renderer.write(`automation: ${toErrorMessage(error)}\n`);
    return 1;
  }
};
