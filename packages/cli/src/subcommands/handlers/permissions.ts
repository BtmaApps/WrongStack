import type { Context } from '@wrongstack/core/agent';
import { compilePermissionRules } from '@wrongstack/core/security';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { createProjectPermissionPolicy } from '@wrongstack/runtime';
import {
  explainCall,
  formatExplainedCall,
  formatPermissionRules,
} from '../../permission-rules-view.js';
import type { SubcommandDeps, SubcommandHandler } from '../contracts.js';

/**
 * `wstack permissions rules [--json]`
 * `wstack permissions explain <tool> --input '<json>' [--json]`
 *
 * Side-effect-free views of the permission policy. Both build the policy the
 * agent itself runs under (`createProjectPermissionPolicy`: directory rules,
 * trust file, YOLO and `autonomy.yoloConfirm` from the config) for a fresh
 * session, without prompting the user, writing to trust files, or mutating
 * session state. `rules` lists every rule in the order they are checked;
 * `explain` traces one call and names the rule that decided it. Inside a
 * session, `/permissions` shows the same with that session's YOLO, answers
 * and session rules.
 */
export const permissionsCmd: SubcommandHandler = async (args, deps) => {
  const subCmd = args[0];

  if (
    subCmd === 'help' ||
    subCmd === '--help' ||
    subCmd === '-h' ||
    !subCmd ||
    (subCmd === 'explain' && !args[1])
  ) {
    deps.renderer.write(usage());
    return 0;
  }

  if (subCmd !== 'explain' && subCmd !== 'rules') {
    deps.renderer.writeError(`Unknown permissions subcommand: ${subCmd}\n`);
    deps.renderer.write(usage());
    return 1;
  }
  const jsonOutput = deps.flags?.['json'] === true || args.includes('--json');

  const built = buildPolicy(deps);
  if (typeof built === 'string') {
    deps.renderer.writeError(`${built}\n`);
    return 1;
  }
  const { policy, ctx, yolo, yoloSource } = built;

  if (subCmd === 'rules') {
    const rules = await compilePermissionRules(policy, ctx, { yolo });
    if (jsonOutput) deps.renderer.write(`${JSON.stringify(rules, null, 2)}\n`);
    // writeLine: the list is full of `*`, which `write` would read as markdown emphasis.
    else
      deps.renderer.writeLine(
        `YOLO: ${yolo ? 'on' : 'off'} (${yoloSource})\n\n${formatPermissionRules(rules)}`,
      );
    return 0;
  }

  // `wstack permissions explain <tool> [--input '<json>'] [--json]`
  const toolName = args[1];
  if (!toolName) {
    deps.renderer.writeError('Missing tool name.\n');
    deps.renderer.write(usage());
    return 1;
  }

  // Parse flags
  const inputIdx = args.indexOf('--input');
  const flagInput = deps.flags?.['input'];
  // Precedence: parsed top-level flags first, then positional --input/<value> as fallback.
  const rawInput =
    typeof flagInput === 'string'
      ? flagInput
      : inputIdx >= 0 && inputIdx + 1 < args.length
        ? args[inputIdx + 1]
        : undefined;

  // Parse input JSON
  let input: unknown = {};
  if (rawInput) {
    try {
      input = JSON.parse(rawInput);
    } catch {
      deps.renderer.writeError(`Invalid --input JSON: ${rawInput}\n`);
      return 1;
    }
  }

  // Resolve tool from registry
  if (!deps.toolRegistry) {
    deps.renderer.writeError('Tool registry is not available.\n');
    return 1;
  }
  const tool = deps.toolRegistry.get(toolName);
  if (!tool) {
    deps.renderer.writeError(
      `Unknown tool: "${toolName}". Available tools: ${deps.toolRegistry
        .list()
        .map((t) => t.name)
        .join(', ')}\n`,
    );
    return 1;
  }

  // The executor's own last gate belongs in the answer too.
  const explained = await explainCall(policy, tool, input, ctx, yolo);

  if (jsonOutput) {
    deps.renderer.write(
      `${JSON.stringify({ ...explained.trace, rule: explained.rule }, null, 2)}\n`,
    );
  } else {
    deps.renderer.writeLine(
      `YOLO: ${yolo ? 'on' : 'off'} (${yoloSource})\n\n${formatExplainedCall(explained)}`,
    );
  }

  return 0;
};

/** The agent's own policy, for a fresh session in this project. */
function buildPolicy(deps: SubcommandDeps):
  | {
      policy: ReturnType<ReturnType<typeof createProjectPermissionPolicy>>;
      ctx: Context;
      yolo: boolean;
      yoloSource: string;
    }
  | string {
  const paths = resolveWstackPaths({ projectRoot: deps.projectRoot, userHome: deps.userHome });

  // A fresh session's view: nothing read yet, working dir = cwd, the
  // configured provider (directory rules can ban providers).
  const readSubjects = new Set<string>();
  const ctx: Context = {
    projectRoot: deps.projectRoot,
    cwd: deps.cwd,
    workingDir: deps.cwd,
    meta: {},
    provider: { id: deps.config.provider },
    hasRead(subject: string) {
      return readSubjects.has(subject);
    },
  } as unknown as Context;

  // The same policy the agent runs under. `--yolo` overrides the config's YOLO.
  const yoloFlag = deps.flags?.['yolo'];
  const yolo = typeof yoloFlag === 'boolean' ? yoloFlag : deps.config.yolo === true;
  try {
    const policy = createProjectPermissionPolicy({
      projectRoot: deps.projectRoot,
      trustFile: paths.projectTrust,
      config: deps.config,
      permission: { yolo },
    })();
    return { policy, ctx, yolo, yoloSource: typeof yoloFlag === 'boolean' ? '--yolo' : 'config' };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function usage(): string {
  return (
    'Usage:\n' +
    '  wstack permissions rules [--json]\n' +
    "  wstack permissions explain <tool> --input '<json>' [--json]\n\n" +
    'Examples:\n' +
    '  wstack permissions rules\n' +
    '  wstack permissions explain bash --input \'{"command":"rm -rf /"}\'\n' +
    '  wstack permissions explain read --input \'{"path":".env"}\' --json\n\n' +
    'Flags:\n' +
    '  --input <json>   Tool input arguments as a JSON object\n' +
    '  --json           Output as structured JSON instead of human-readable text\n' +
    '  --yolo           Show the rules as they apply with YOLO on\n\n' +
    'Inside a session, /permissions shows the same with that session’s YOLO,\n' +
    'answers and /permissions allow|deny rules.\n'
  );
}
