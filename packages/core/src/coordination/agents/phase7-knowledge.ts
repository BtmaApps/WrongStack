import { applyLazyPrompts } from './agent-prompts.js';
import { type AgentDefinition, LIGHT_BUDGET, MEDIUM_BUDGET, TOOLS } from './types.js';

/** Phase 7 · Knowledge — documentation, diagrams, localization, and prompts. */
export const KNOWLEDGE_AGENTS: AgentDefinition[] = [
  {
    config: {
      id: 'document',
      name: 'Document',
      role: 'document',
      tools: [...TOOLS.docs],
    },
    budget: MEDIUM_BUDGET,
    capability: {
      phase: 'knowledge',
      summary:
        'Technical documentation: READMEs, API/reference docs, guides, and verified examples grounded in code.',
      keywords: [
        'document',
        'documentation',
        'readme',
        'docs',
        'write up',
        'guide',
        'api docs',
        'explain in writing',
        'reference',
        'changelog notes',
      ],
    },
  },
  {
    config: {
      id: 'uml',
      name: 'UML',
      role: 'uml',
      tools: [...TOOLS.read, 'write', 'edit'],
    },
    budget: LIGHT_BUDGET,
    capability: {
      phase: 'knowledge',
      summary:
        'Diagram generation from code: class/sequence/component/ER diagrams as Mermaid/PlantUML.',
      keywords: [
        'uml',
        'diagram',
        'mermaid',
        'plantuml',
        'sequence diagram',
        'class diagram',
        'er diagram',
        'visualize',
        'flowchart',
        'architecture diagram',
      ],
    },
  },
  {
    config: {
      id: 'i18n',
      name: 'I18n',
      role: 'i18n',
      tools: [...TOOLS.write],
    },
    budget: MEDIUM_BUDGET,
    capability: {
      phase: 'knowledge',
      summary:
        'Internationalization/localization: string extraction, catalog management, plurals/RTL/format handling.',
      keywords: [
        'i18n',
        'internationalization',
        'localization',
        'l10n',
        'translation',
        'translate ui',
        'locale',
        'rtl',
        'message catalog',
        'multilingual',
      ],
    },
  },
  {
    config: {
      id: 'prompt',
      name: 'Prompt',
      role: 'prompt',
      tools: [...TOOLS.write],
    },
    budget: LIGHT_BUDGET,
    capability: {
      phase: 'knowledge',
      summary:
        'Prompt engineering: designs/refines/evaluates LLM system prompts and agent instructions.',
      keywords: [
        'prompt',
        'prompt engineering',
        'system prompt',
        'llm instructions',
        'few-shot',
        'refine prompt',
        'agent instructions',
        'prompt template',
      ],
    },
  },
  {
    config: {
      id: 'writer',
      name: 'Writer',
      role: 'writer',
      tools: [
        'read',
        'grep',
        'glob',
        'search',
        'fetch',
        'read_url_content',
        'write',
        'edit',
        'mailbox',
      ],
    },
    budget: MEDIUM_BUDGET,
    capability: {
      phase: 'knowledge',
      summary:
        'General writing and editing: reports, articles, emails, letters, proposals, summaries — no invented facts.',
      keywords: [
        'writer',
        'write an email',
        'write a report',
        'write an article',
        'blog post',
        'cover letter',
        'proposal',
        'proofread',
        'copyedit',
        'rewrite this',
        'press release',
        'newsletter',
      ],
    },
  },
  {
    config: {
      id: 'translator',
      name: 'Translator',
      role: 'translator',
      tools: ['read', 'grep', 'glob', 'search', 'fetch', 'write', 'edit', 'mailbox'],
    },
    budget: MEDIUM_BUDGET,
    capability: {
      phase: 'knowledge',
      summary:
        'Document and prose translation: preserves meaning, tone, formatting, placeholders, and glossary terms.',
      keywords: [
        'translator',
        'translate this',
        'translate document',
        'translate text',
        'translate article',
        'review translation',
        'bilingual',
      ],
    },
  },
];

/**
 * Resolve each role brief from disk on first read rather than at module load.
 * These arrays are exported in their own right, so the accessor belongs on the
 * raw definitions — `assignSkillsToAgents` copies it by descriptor.
 */
applyLazyPrompts(KNOWLEDGE_AGENTS);
