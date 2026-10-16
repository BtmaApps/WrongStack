/**
 * Stable JSON Schema for the rulebook. Authored as a string literal so the
 * schema travels with the package and can be emitted by tooling.
 * Implementation: emitted by `scripts/check-rulebook.mjs` at CI time.
 */
export const RULEBOOK_JSON_SCHEMA: string = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://wrongstack.dev/schemas/techstack.rulebook.v1.json',
    title: 'TechStack Rulebook',
    type: 'object',
    required: ['schemaVersion'],
    additionalProperties: false,
    properties: {
      schemaVersion: { const: '1' },
      projectId: { type: 'string', minLength: 1 },
      pinned: {
        type: 'array',
        items: {
          type: 'object',
          required: ['selector', 'max', 'reason'],
          additionalProperties: false,
          properties: {
            selector: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ecosystem: { type: 'string' },
                name: { type: 'string' },
                namePattern: { type: 'string' },
              },
            },
            max: { type: 'string', minLength: 1 },
            reason: { type: 'string', minLength: 1 },
            reviewAfter: { type: 'string', format: 'date-time' },
          },
        },
      },
      banned: {
        type: 'array',
        items: {
          type: 'object',
          required: ['selector', 'reason'],
          additionalProperties: false,
          properties: {
            selector: { $ref: '#/$defs/selector' },
            reason: { type: 'string', minLength: 1 },
            replacement: {
              type: 'object',
              required: ['ecosystem', 'name'],
              additionalProperties: false,
              properties: {
                ecosystem: { type: 'string' },
                name: { type: 'string' },
                minVersion: { type: 'string' },
                notes: { type: 'string' },
              },
            },
            since: { type: 'string', format: 'date-time' },
          },
        },
      },
      deferred: {
        type: 'array',
        items: {
          type: 'object',
          required: ['selector', 'until', 'reason'],
          additionalProperties: false,
          properties: {
            selector: { $ref: '#/$defs/selector' },
            until: { type: 'string', format: 'date-time' },
            reason: { type: 'string', minLength: 1 },
            ticket: { type: 'string' },
          },
        },
      },
      preferred: {
        type: 'array',
        items: {
          type: 'object',
          required: ['selector', 'context'],
          additionalProperties: false,
          properties: {
            selector: { $ref: '#/$defs/selector' },
            context: { type: 'string', minLength: 1 },
            deprecates: { $ref: '#/$defs/selector' },
          },
        },
      },
      packageManager: {
        type: 'object',
        additionalProperties: false,
        properties: {
          npm: { type: 'string' },
          python: { type: 'string' },
          rust: { type: 'string' },
          go: { type: 'string' },
          dotnet: { type: 'string' },
          php: { type: 'string' },
          dart: { type: 'string' },
          java: { type: 'string' },
          ruby: { type: 'string' },
          swift: { type: 'string' },
          elixir: { type: 'string' },
        },
      },
      advisorHints: {
        type: 'string',
        maxLength: 8192,
      },
    },
    $defs: {
      selector: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ecosystem: { type: 'string' },
          name: { type: 'string' },
          namePattern: { type: 'string' },
        },
      },
    },
  },
  null,
  2,
);
