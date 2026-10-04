import { expect, it } from 'vitest';
import {
  compactSchemaDescriptions,
  compactToolDefinitionForWire,
  normalizeTopLevelToolSchema,
} from '../../src/utils/tool-wire-compact.js';

it.each(['__proto__', 'constructor', 'toString', 'ordinary'])(
  'retains the JSON Schema field %s through copy and merge',
  (key) => {
    const schema = {
      type: 'object',
      properties: Object.fromEntries([[key, { type: 'string', description: 'test field' }]]),
      required: [key],
    };
    const before = JSON.stringify(schema);
    const compact = compactSchemaDescriptions(schema);
    expect(Object.hasOwn(compact.properties as object, key)).toBe(true);
    expect(Object.getPrototypeOf(compact.properties)).toBe(Object.prototype);
    for (const combinator of ['anyOf', 'oneOf', 'allOf']) {
      const wire = compactToolDefinitionForWire({
        name: 'test',
        inputSchema: { [combinator]: [schema] },
      });
      expect(Object.keys(wire.inputSchema.properties as object)).toEqual([key]);
      expect(wire.inputSchema.required).toEqual([key]);
      expect(Object.hasOwn(JSON.parse(JSON.stringify(wire)).inputSchema.properties, key)).toBe(
        true,
      );
      const flat = normalizeTopLevelToolSchema({ [combinator]: [schema] });
      expect(Object.hasOwn(flat.properties as object, key)).toBe(true);
    }
    expect(JSON.stringify(schema)).toBe(before);
  },
);
