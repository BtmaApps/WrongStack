import {
  commandField,
  json,
  object,
  projectPath,
  run,
  stringField,
  workflowPlugin,
} from '../workflow-runtime/index.js';
import { dirname, relative } from 'node:path';

export default workflowPlugin({
  name: 'workspace-recipe-runner',
  description:
    'Discovers explicit package scripts and their package-manager and runtime prerequisites, then runs a selected structured command',
  tools: [
    {
      name: 'workspace_recipes',
      description:
        'Read a package.json and list its scripts, working directory, declared package manager, engines and required workspace dependency builds.',
      properties: { path: stringField },
      required: ['path'],
      async run(input, context) {
        const manifest = await json(context.root, input.path);
        const manager =
          typeof manifest.packageManager === 'string'
            ? manifest.packageManager.split('@')[0]
            : null;
        const cwd = relative(context.root, dirname(projectPath(context.root, input.path))) || '.';
        return {
          package: manifest.name,
          manager,
          engines: manifest.engines ?? {},
          prerequisites: Object.entries({
            ...object(manifest.dependencies ?? {}),
            ...object(manifest.devDependencies ?? {}),
          })
            .filter(
              ([, version]) => typeof version === 'string' && version.startsWith('workspace:'),
            )
            .map(([name]) => name),
          recipes: Object.entries(object(manifest.scripts ?? {})).map(([name, script]) => ({
            name,
            script,
            command: manager ? { program: manager, args: ['run', name], cwd } : null,
          })),
          limitation: manager
            ? null
            : 'No packageManager declared; select a launcher before execution.',
        };
      },
    },
    {
      name: 'workspace_recipe_run',
      mutating: true,
      description:
        'Execute a reviewed structured recipe with project-contained cwd, cancellation and timeout.',
      properties: { command: commandField },
      required: ['command'],
      async run(input, context) {
        return run(input.command, context);
      },
    },
  ],
});
