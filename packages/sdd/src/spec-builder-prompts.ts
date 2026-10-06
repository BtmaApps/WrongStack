/**
 * Phase prompts `AISpecBuilder.getAIPrompt()` injects into the conversation:
 * questioning interview, spec review, implementation planning (with the task
 * JSON contract), task review and execution.
 */
import { expectDefined } from '@wrongstack/core/utils';
import type { AISpecSession } from './sdd-session-types.js';

export function buildQuestioningPrompt(session: AISpecSession, min: number, max: number): string {
  const answered = session.answers.length;
  const remaining = Math.max(0, min - answered);
  const budget = max - answered;

  const lines: string[] = [
    `═══ SDD Spec Builder ═══`,
    `Feature: "${session.title}"`,
    session.userIntent ? `Intent: ${session.userIntent}` : '',
    `Phase: Questioning (${answered} answered, ${budget} remaining budget)`,
    '',
    '**Instructions for AI:**',
    '',
    'You are conducting a specification interview. Your job is to ask the user',
    'intelligent, contextual questions to understand what they want to build.',
    '',
    `You have asked ${answered} questions so far.`,
  ];

  if (remaining > 0) {
    lines.push(`You MUST ask at least ${remaining} more question(s) before generating the spec.`);
  } else if (budget <= 0) {
    lines.push('You have reached the maximum question budget. Generate the spec NOW.');
  } else {
    lines.push(
      'You may ask more questions if needed, or generate the spec if you have enough information.',
      'Ask a question ONLY if it reveals something you genuinely need to know.',
    );
  }

  lines.push(
    '',
    '**Rules:**',
    '- Ask ONE question at a time',
    '- Questions must be specific and contextual — never generic',
    '- Adapt based on previous answers',
    '- Cover: scope, constraints, edge cases, integrations, security, performance as relevant',
    '- When asking questions with distinct architectural or trade-off choices, include 2 to 4 recommended options as a list (e.g. 1. ... 2. ...) so the operator can quickly choose or customize',
    '- When you have enough info, respond with the full specification in JSON format',
    '- This is a planning interview: respond with TEXT ONLY (a question, or the spec JSON).',
    '  Do NOT write or edit files, and do NOT run shell/terminal commands — the code is',
    '  written later, after the plan is approved.',
    '',
    `**Question budget:** ${budget}/${max} remaining`,
    `**Minimum required:** ${remaining > 0 ? remaining : 'met'}`,
  );

  if (session.projectContext) {
    lines.push('', '**Project Context:**', '```', session.projectContext, '```');
  }

  if (answered > 0) {
    lines.push('', '**Conversation so far:**');
    for (let i = 0; i < answered; i++) {
      const a = expectDefined(session.answers[i]);
      lines.push(``, `Q${i + 1}: ${a.question}`, `A${i + 1}: ${a.answer}`);
    }
  }

  lines.push(
    '',
    '---',
    'Now either:',
    `1. Ask your next question (if you need more info)`,
    `2. Generate the complete specification as JSON (if ready)`,
    '',
    'If generating spec, output JSON inside ```json code block with this structure:',
    '```json',
    '{',
    '  "title": "...",',
    '  "overview": "...",',
    '  "sections": [{ "type": "overview|requirements|architecture|api|data|security|acceptance", "title": "...", "content": "...", "level": 1 }],',
    '  "requirements": [{ "id": "REQ-1", "type": "functional|non-functional|security|performance|ux", "priority": "critical|high|medium|low", "description": "...", "acceptanceCriteria": ["..."] }]',
    '}',
    '```',
  );

  return lines.filter(Boolean).join('\n');
}

export function buildSpecReviewPrompt(session: AISpecSession): string {
  const spec = session.spec;
  if (!spec) return 'No spec generated yet.';

  const reqSummary = spec.requirements.map((r) => `  [${r.priority}] ${r.description}`).join('\n');

  return [
    `═══ Spec Review ═══`,
    `Feature: "${spec.title}"`,
    `Requirements: ${spec.requirements.length}`,
    '',
    '**Specification:**',
    spec.overview,
    '',
    '**Requirements:**',
    reqSummary,
    '',
    '---',
    'Approve this spec? The AI will then generate an implementation plan and tasks.',
    'Say "approve" to proceed, or describe what needs to change.',
  ].join('\n');
}

export function buildImplementationPrompt(session: AISpecSession): string {
  const spec = session.spec;
  if (!spec) return 'No spec to implement.';

  const reqList = spec.requirements.map((r) => `  - [${r.priority}] ${r.description}`).join('\n');

  return [
    `═══ Implementation Planning ═══`,
    `Feature: "${spec.title}"`,
    `Requirements: ${spec.requirements.length}`,
    '',
    '**Requirements to implement:**',
    reqList,
    '',
    '**Instructions for AI:**',
    'Generate a detailed implementation plan for this specification.',
    'This is a PLANNING step — describe the plan and emit the task JSON as TEXT. Do NOT',
    'create or edit files and do NOT run shell/terminal commands here; the tasks you list',
    'are executed later, one by one, after you approve them.',
    'Include:',
    '1. Architecture decisions',
    '2. File structure changes',
    '3. Key implementation details',
    '4. Dependency requirements',
    '5. Testing strategy',
    '',
    '**IMPORTANT:** After the plan, you MUST generate executable tasks as a JSON array.',
    'Each task should be a concrete, actionable step. Output the JSON inside a ```json code block:',
    '```json',
    '[',
    '  {',
    '    "id": "t1",',
    '    "title": "Create auth middleware",',
    '    "description": "Implement JWT verification middleware for protected routes",',
    '    "type": "feature",',
    '    "priority": "critical",',
    '    "estimateHours": 3,',
    '    "dependsOn": [],',
    '    "tags": ["auth", "middleware"]',
    '  },',
    '  {',
    '    "id": "t2",',
    '    "title": "Write auth tests",',
    '    "description": "Unit and integration tests for authentication flow",',
    '    "type": "test",',
    '    "priority": "high",',
    '    "estimateHours": 2,',
    '    "dependsOn": ["t1"],',
    '    "tags": ["test", "auth"]',
    '  }',
    ']',
    '```',
    '',
    'Rules:',
    '- Give every task a short stable "id" (t1, t2, …). Reference prerequisites in "dependsOn"',
    '  as a list of those ids — this builds the real dependency graph that drives parallel vs',
    '  sequential execution.',
    '- "dependsOn": [] means the task is independent and may run in parallel with other roots.',
    '- A task with dependsOn runs ONLY after every listed task completes. Model true ordering:',
    '  tests depend on the feature they test, docs/integration depend on the parts they cover.',
    '- Do NOT create cycles (t1→t2→t1). Keep chains as shallow as correctness allows so',
    '  independent work runs concurrently.',
    '- Use type: "feature" for code, "test" for tests, "docs" for documentation, "chore" for config',
    '- Use priority: "critical" for blockers, "high" for core features, "medium" for nice-to-haves, "low" for polish',
  ].join('\n');
}

export function buildTaskReviewPrompt(session: AISpecSession): string {
  return [
    `═══ Task Review ═══`,
    `Feature: "${session.spec?.title ?? session.title}"`,
    '',
    session.implementation ?? 'No implementation plan yet.',
    '',
    '---',
    'Ready to execute these tasks? Say "execute" to begin, or describe changes needed.',
  ].join('\n');
}

export function buildExecutingPrompt(session: AISpecSession): string {
  return [
    `═══ Task Execution ═══`,
    `Feature: "${session.spec?.title ?? session.title}"`,
    '',
    '**Instructions for AI:**',
    'Execute the tasks one by one in the order shown in the task list above.',
    '',
    'For each task:',
    '1. Implement the code (create/modify files)',
    '2. Write tests if applicable',
    '3. After completing a task, tell the user to run: /sdd done <task number or title>',
    '4. Then move to the next task',
    '',
    '**Important:**',
    '- Focus on ONE task at a time',
    '- After completing each task, explicitly state what you did',
    '- Tell the user: "Run /sdd done <N> to mark this task complete"',
    '- Then proceed to the next task automatically',
    '- When ALL tasks are done, provide a summary of everything implemented',
    '',
    'Start executing the first pending task now.',
  ].join('\n');
}
