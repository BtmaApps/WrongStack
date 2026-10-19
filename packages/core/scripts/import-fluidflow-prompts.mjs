/** Import all FluidFlow prompts verbatim from a local checkout. Run with Bun. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = process.argv[2];
if (!source)
  throw new Error(
    'Usage: bun packages/core/scripts/import-fluidflow-prompts.mjs <FluidFlow checkout>',
  );
const root = path.resolve(source);
const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const dataDir = fileURLToPath(new URL('../data/prompts/', import.meta.url));
const { promptLibrary, quickPrompts } = await import(
  pathToFileURL(path.join(root, 'data/promptLibrary/index.ts')).href
);
const { getPromptTemplates } = await import(
  pathToFileURL(path.join(root, 'services/promptTemplateStorage.ts')).href
);
const groups = new Map();
const refs = [];
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
function add(category, originalId, title, content, sourceFile, extra = {}) {
  const slug = `fluidflow-${category}-${originalId}-${slugify(title)}`
    .slice(0, 64)
    .replace(/-+$/g, '');
  const variables = [
    ...new Set([...content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1])),
  ].map((name) => ({ name, description: name, required: true, multiline: true }));
  const entry = {
    slug,
    title,
    description: `FluidFlow · ${title}`,
    content,
    tags: ['fluidflow', category, originalId],
    author: 'Ersin KOÇ',
    version: revision,
    license: 'MIT',
    ...(variables.length ? { variables } : {}),
    ...extra,
  };
  if (!groups.has(category)) groups.set(category, []);
  groups.get(category).push(entry);
  refs.push({
    slug,
    originalId,
    sourceFile,
    checksum: createHash('sha256').update(content).digest('hex'),
    ...(extra.variants
      ? {
          variants: Object.fromEntries(
            Object.entries(extra.variants).map(([level, text]) => [
              level,
              createHash('sha256').update(text).digest('hex'),
            ]),
          ),
        }
      : {}),
  });
}
for (const category of [...promptLibrary, { id: 'quick-actions', prompts: quickPrompts }]) {
  for (const item of category.prompts) {
    add(
      category.id,
      item.id,
      item.label,
      item.detailed,
      category.id === 'quick-actions'
        ? 'data/promptLibrary/quickPrompts.ts'
        : `data/promptLibrary/categories/${category.id}.ts`,
      { variants: { simple: item.simple, detailed: item.detailed, advanced: item.advanced } },
    );
  }
}
for (const template of getPromptTemplates()) {
  add(
    'ui-templates',
    template.id,
    template.name,
    template.prompt,
    'services/promptTemplateStorage.ts',
    {
      description: template.description,
      variables: template.variables.map((v) => ({
        name: v.name,
        description: v.description,
        required: true,
        default: v.defaultValue,
      })),
    },
  );
}
for (const name of fs
  .readdirSync(path.join(root, 'prompts'))
  .filter((f) => f.endsWith('.md'))
  .sort()) {
  const content = fs.readFileSync(path.join(root, 'prompts', name), 'utf8');
  add(
    'fluidflow-workflows',
    path.basename(name, '.md'),
    `FluidFlow ${path.basename(name, '.md')}`,
    content,
    `prompts/${name}`,
  );
}
if (new Set(refs.map((r) => r.slug)).size !== refs.length)
  throw new Error('Duplicate FluidFlow slug');
for (const [category, entries] of groups) {
  fs.writeFileSync(
    path.join(dataDir, '_seed', `${category}.jsonl`),
    `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`,
  );
}
const provenanceDir = path.join(dataDir, 'fluidflow');
fs.mkdirSync(provenanceDir, { recursive: true });
fs.copyFileSync(path.join(root, 'LICENSE.md'), path.join(provenanceDir, 'LICENSE.md'));
fs.writeFileSync(
  path.join(provenanceDir, 'upstream.json'),
  `${JSON.stringify(
    {
      repository: 'https://github.com/ersinkoc/FluidFlow',
      revision,
      count: refs.length,
      prompts: refs,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Imported ${refs.length} FluidFlow prompts at ${revision}; run bun packages/core/scripts/build-prompts.mjs`,
);
