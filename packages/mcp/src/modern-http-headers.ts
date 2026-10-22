import { MODERN_PROTOCOL_VERSION, objectRecord, requestVersion } from './modern-protocol.js';
import { TASK_METHODS } from './task-protocol.js';

interface Binding {
  name: string;
  path: string[];
  type: 'string' | 'integer' | 'boolean';
}
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const schemaMaps = new Set(['patternProperties', '$defs', 'definitions', 'dependentSchemas']);
const schemaChildren = new Set([
  'items',
  'prefixItems',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'propertyNames',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
]);

export function toolHeaderBindings(schema: unknown): Binding[] {
  const bindings: Binding[] = [];
  const names = new Set<string>();
  const visit = (value: unknown, path: string[] | undefined) => {
    const node = objectRecord(value);
    if (!node) return;
    if (Object.hasOwn(node, 'x-mcp-header')) {
      const name = node['x-mcp-header'];
      const type = node['type'];
      if (
        !path?.length ||
        typeof name !== 'string' ||
        !token.test(name) ||
        names.has(name.toLowerCase()) ||
        !['string', 'integer', 'boolean'].includes(String(type))
      )
        throw new Error('Invalid x-mcp-header annotation');
      names.add(name.toLowerCase());
      bindings.push({ name, path, type: type as Binding['type'] });
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'properties') {
        for (const [property, nested] of Object.entries(objectRecord(child) ?? {}))
          visit(nested, path ? [...path, property] : undefined);
      } else if (schemaMaps.has(key)) {
        for (const nested of Object.values(objectRecord(child) ?? {})) visit(nested, undefined);
      } else if (schemaChildren.has(key)) {
        for (const nested of Array.isArray(child) ? child : [child]) visit(nested, undefined);
      }
    }
  };
  visit(schema, []);
  return bindings;
}

function encodeMcpHeader(value: string): string {
  return /^[\x09\x20-\x7e]*$/.test(value) &&
    value.trim() === value &&
    !value.startsWith('=?base64?')
    ? value
    : `=?base64?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function decodeMcpHeader(value: string): string {
  if (value.startsWith('=?base64?')) {
    const match = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/.exec(value);
    if (!match) throw new Error('Malformed MCP Base64 header');
    const bytes = Buffer.from(match[1]!, 'base64');
    if (bytes.toString('base64') !== match[1]) throw new Error('Malformed MCP Base64 header');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  if (!/^[\x09\x20-\x7e]*$/.test(value) || value.trim() !== value)
    throw new Error('Malformed MCP header value');
  return value;
}

function parameterValue(args: unknown, binding: Binding): string | undefined {
  let value = args;
  for (const key of binding.path) {
    const node = objectRecord(value);
    if (!node || !Object.hasOwn(node, key)) return undefined;
    value = node[key];
  }
  if (value === undefined || value === null) return undefined;
  if (binding.type === 'integer' ? !Number.isSafeInteger(value) : typeof value !== binding.type)
    throw new Error(`Invalid mirrored MCP parameter ${binding.path.join('.')}`);
  return String(value);
}

export function modernRequestHeaders(
  method: string,
  params: unknown,
  schema?: unknown,
): Record<string, string> {
  const input = objectRecord(params);
  const headers: Record<string, string> = {
    'MCP-Protocol-Version': MODERN_PROTOCOL_VERSION,
    'Mcp-Method': method,
  };
  const name = TASK_METHODS.has(method)
    ? input?.['taskId']
    : method === 'resources/read'
      ? input?.['uri']
      : ['tools/call', 'prompts/get'].includes(method)
        ? input?.['name']
        : undefined;
  if (typeof name === 'string') headers['Mcp-Name'] = encodeMcpHeader(name);
  if (method === 'tools/call')
    for (const binding of toolHeaderBindings(schema)) {
      const value = parameterValue(input?.['arguments'], binding);
      if (value !== undefined) headers[`Mcp-Param-${binding.name}`] = encodeMcpHeader(value);
    }
  return headers;
}

export function validateModernHeaders(
  method: string,
  params: unknown,
  headers: Headers,
  schema?: unknown,
): void {
  const expected = modernRequestHeaders(method, params, schema);
  const version = requestVersion(params);
  if (typeof version !== 'string') throw new Error('Missing protocol version metadata');
  expected['MCP-Protocol-Version'] = version;
  // Name is required for these methods even when the body is malformed.
  if (
    (TASK_METHODS.has(method) ||
      ['tools/call', 'resources/read', 'prompts/get'].includes(method)) &&
    !expected['Mcp-Name']
  )
    throw new Error('Missing MCP name or URI');
  for (const [name, value] of Object.entries(expected)) {
    const actual = headers.get(name);
    const matches =
      name === 'Mcp-Method' || name === 'MCP-Protocol-Version'
        ? actual === value
        : actual !== null && decodeMcpHeader(actual) === decodeMcpHeader(value);
    if (!matches) throw new Error(`Header mismatch: ${name}`);
  }
  if (method === 'tools/call')
    for (const binding of toolHeaderBindings(schema)) {
      const name = `Mcp-Param-${binding.name}`;
      if (!Object.hasOwn(expected, name) && headers.has(name))
        throw new Error(`Unexpected header: ${name}`);
    }
}
