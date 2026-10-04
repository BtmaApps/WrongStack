export interface CollabAgentTasksHost {
  options: import('./collab-debug-types.js').CollabSessionOptions;
  director: import('./collab-director-host.js').CollabDirectorHost;
  snapshot: import('./collab-debug-types.js').SharedFileSnapshot;
  sessionId: string;
}

export function extractJsonObjects(
  this: CollabAgentTasksHost,
  text: string,
): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            objects.push(parsed as Record<string, unknown>);
          }
        } catch {
          // skip malformed span
        }
        start = -1;
      }
    }
  }
  return objects;
}

export function budgetForRole(
  this: CollabAgentTasksHost,
  role: string,
): {
  maxIterations: number;
  maxToolCalls: number;
  timeoutMs: number;
} {
  if (this.options.budgetOverrides?.[role]) {
    return (
      this.options.budgetOverrides[role] ?? { maxIterations: 0, maxToolCalls: 0, timeoutMs: 0 }
    );
  }
  const defaults: Record<
    string,
    { maxIterations: number; maxToolCalls: number; timeoutMs: number }
  > = {
    'bug-hunter': { maxIterations: 2000, maxToolCalls: 5000, timeoutMs: 10 * 60 * 1000 },
    'refactor-planner': { maxIterations: 1500, maxToolCalls: 4000, timeoutMs: 8 * 60 * 1000 },
    critic: { maxIterations: 1000, maxToolCalls: 3000, timeoutMs: 6 * 60 * 1000 },
  };
  return defaults[role] ?? { maxIterations: 1500, maxToolCalls: 4000, timeoutMs: 8 * 60 * 1000 };
}

export function buildBugHunterTask(this: CollabAgentTasksHost): string {
  const scratchpad = this.director.sharedScratchpadPath ?? '/tmp';
  const fileContents = this.snapshot.files
    .map((f) => `=== ${f.path} ===\n${f.content}`)
    .join('\n\n');
  return (
    `You are BugHunter. Scan the following files for bugs and code smells.\n` +
    `This is an analysis role: do not edit the target files; report findings only.\n\n` +
    `Target files:\n${fileContents}\n\n` +
    `For each bug found, emit it using the fleet_emit tool immediately:\n` +
    `{ "type": "bug.found", "payload": { "finding": { "id": "<uuid>", "type": "<pattern>", ` +
    `"severity": "<critical|high|medium|low>", ` +
    `"location": { "file": "<path>", "line": <n> }, "description": "<explain>", "suggestedFix": "<optional>" } } }\n\n` +
    `After scanning all files, write your full markdown bug report to:\n` +
    `${scratchpad}/bug-hunter-report-${this.sessionId}.md\n\n` +
    `Important: emit each finding as soon as you find it. Do not batch or wait until the end.`
  );
}

export function buildRefactorPlannerTask(this: CollabAgentTasksHost): string {
  const scratchpad = this.director.sharedScratchpadPath ?? '/tmp';
  const bugHunterReportPath = `${scratchpad}/bug-hunter-report-${this.sessionId}.md`;
  const fileContents = this.snapshot.files
    .map((f) => `=== ${f.path} ===\n${f.content}`)
    .join('\n\n');
  return (
    `You are RefactorPlanner. Plan refactorings for the following files.\n` +
    `This is an analysis role: do not edit the target files; emit the plan only.\n\n` +
    `Target files:\n${fileContents}\n\n` +
    `Read the BugHunter report at: ${bugHunterReportPath}\n\n` +
    `For each bug you can address, emit a refactor plan using fleet_emit:\n` +
    `{ "type": "refactor.plan", "payload": { "plan": { "id": "<uuid>", "basedOnBugIds": ["<bug-id>"], ` +
    `"phases": [{ "number": 1, "title": "<phase>", "tasks": ["<task>"], "risk": "<low|medium|high>" }], ` +
    `"riskScore": "<low|medium|high>", "estimatedChangeCount": <n>, "rollbackStrategy": "<text>" } } }\n\n` +
    `Also write your full markdown plan to:\n` +
    `${scratchpad}/refactor-plan-${this.sessionId}.md\n\n` +
    `Emit each plan immediately. Do not wait until planning is complete.`
  );
}

export function buildCriticTask(this: CollabAgentTasksHost): string {
  const scratchpad = this.director.sharedScratchpadPath ?? '/tmp';
  const bugHunterReportPath = `${scratchpad}/bug-hunter-report-${this.sessionId}.md`;
  const refactorPlanPath = `${scratchpad}/refactor-plan-${this.sessionId}.md`;
  const fileContents = this.snapshot.files
    .map((f) => `=== ${f.path} ===\n${f.content}`)
    .join('\n\n');
  return (
    `You are Critic. Evaluate bug findings and refactor plans.\n` +
    `This is an analysis role: do not edit the target files; emit evaluations only.\n\n` +
    `Target files:\n${fileContents}\n\n` +
    `Read the BugHunter report at: ${bugHunterReportPath}\n` +
    `Read the RefactorPlanner report at: ${refactorPlanPath}\n\n` +
    `For each bug and refactor plan, emit your evaluation using fleet_emit:\n` +
    `{ "type": "critic.evaluation", "payload": { "evaluation": { "id": "<uuid>", ` +
    `"subjectType": "<bug_finding|refactor_plan>", "subjectId": "<id>", ` +
    `"score": <0-10>, "verdict": "<approve|needs_revision|reject>", ` +
    `"strengths": ["<strength>"], "weaknesses": ["<weakness>"], ` +
    `"concerns": [{ "description": "<concern>", "severity": "<blocking|advisory>" }] } } }\n\n` +
    `After all evaluations, write your markdown report to:\n` +
    `${scratchpad}/critic-report-${this.sessionId}.md\n\n` +
    `Emit each evaluation immediately. Do not wait until you have read all reports.`
  );
}
