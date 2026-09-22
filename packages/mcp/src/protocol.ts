/** Typed MCP protocol surface for server discovery, resources, and prompts. */

export interface MCPImplementationInfo {
  name: string;
  version: string;
  title?: string | undefined;
}

export interface MCPServerCapabilities {
  tools?: { listChanged?: boolean | undefined } | undefined;
  resources?: { subscribe?: boolean | undefined; listChanged?: boolean | undefined } | undefined;
  prompts?: { listChanged?: boolean | undefined } | undefined;
  logging?: Record<string, never> | undefined;
  [capability: string]: unknown;
}

export interface MCPServerMetadata {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPImplementationInfo;
  instructions?: string | undefined;
}

export interface MCPResource {
  uri: string;
  name: string;
  title?: string | undefined;
  description?: string | undefined;
  mimeType?: string | undefined;
  size?: number | undefined;
  annotations?: Record<string, unknown> | undefined;
}

export interface MCPResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string | undefined;
  description?: string | undefined;
  mimeType?: string | undefined;
  annotations?: Record<string, unknown> | undefined;
}

export interface MCPResourceContents {
  uri: string;
  mimeType?: string | undefined;
  text?: string | undefined;
  blob?: string | undefined;
}

export interface MCPPromptArgument {
  name: string;
  description?: string | undefined;
  required?: boolean | undefined;
}

export interface MCPPrompt {
  name: string;
  title?: string | undefined;
  description?: string | undefined;
  arguments?: MCPPromptArgument[] | undefined;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  /** Preserve text, image, audio, embedded-resource, and resource-link blocks. */
  content: unknown;
}

export interface MCPListResourcesResult {
  resources: MCPResource[];
  nextCursor?: string | undefined;
}

export interface MCPListResourceTemplatesResult {
  resourceTemplates: MCPResourceTemplate[];
  nextCursor?: string | undefined;
}

export interface MCPReadResourceResult {
  contents: MCPResourceContents[];
}

export interface MCPListPromptsResult {
  prompts: MCPPrompt[];
  nextCursor?: string | undefined;
}

export interface MCPGetPromptResult {
  description?: string | undefined;
  messages: MCPPromptMessage[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Malformed MCP ${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Malformed MCP ${label}: expected non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Malformed MCP ${label}: expected string`);
  return value;
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return record(value, label);
}

function optionalCursor(value: unknown, label: string): string | undefined {
  return optionalString(value, `${label}.nextCursor`);
}

export function parseServerMetadata(value: unknown): MCPServerMetadata {
  const input = record(value, 'initialize result');
  const serverInfo = record(input['serverInfo'], 'initialize.serverInfo');
  const capabilities = record(input['capabilities'], 'initialize.capabilities');
  return {
    protocolVersion: requiredString(input['protocolVersion'], 'initialize.protocolVersion'),
    capabilities: capabilities as MCPServerCapabilities,
    serverInfo: {
      name: requiredString(serverInfo['name'], 'initialize.serverInfo.name'),
      version: requiredString(serverInfo['version'], 'initialize.serverInfo.version'),
      title: optionalString(serverInfo['title'], 'initialize.serverInfo.title'),
    },
    instructions: optionalString(input['instructions'], 'initialize.instructions'),
  };
}

function parseResource(value: unknown, index: number): MCPResource {
  const input = record(value, `resources/list.resources[${index}]`);
  const size = input['size'];
  if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size < 0)) {
    throw new Error(`Malformed MCP resources/list.resources[${index}].size`);
  }
  return {
    uri: requiredString(input['uri'], `resources/list.resources[${index}].uri`),
    name: requiredString(input['name'], `resources/list.resources[${index}].name`),
    title: optionalString(input['title'], `resources/list.resources[${index}].title`),
    description: optionalString(
      input['description'],
      `resources/list.resources[${index}].description`,
    ),
    mimeType: optionalString(input['mimeType'], `resources/list.resources[${index}].mimeType`),
    size: size as number | undefined,
    annotations: optionalRecord(
      input['annotations'],
      `resources/list.resources[${index}].annotations`,
    ),
  };
}

export function parseListResourcesResult(value: unknown): MCPListResourcesResult {
  const input = record(value, 'resources/list result');
  if (!Array.isArray(input['resources'])) {
    throw new Error('Malformed MCP resources/list result: resources must be an array');
  }
  return {
    resources: input['resources'].map(parseResource),
    nextCursor: optionalCursor(input['nextCursor'], 'resources/list'),
  };
}

export function parseListResourceTemplatesResult(value: unknown): MCPListResourceTemplatesResult {
  const input = record(value, 'resources/templates/list result');
  const templates = input['resourceTemplates'];
  if (!Array.isArray(templates)) {
    throw new Error(
      'Malformed MCP resources/templates/list result: resourceTemplates must be an array',
    );
  }
  return {
    resourceTemplates: templates.map((value, index) => {
      const template = record(value, `resources/templates/list.resourceTemplates[${index}]`);
      return {
        uriTemplate: requiredString(
          template['uriTemplate'],
          `resources/templates/list.resourceTemplates[${index}].uriTemplate`,
        ),
        name: requiredString(
          template['name'],
          `resources/templates/list.resourceTemplates[${index}].name`,
        ),
        title: optionalString(
          template['title'],
          `resources/templates/list.resourceTemplates[${index}].title`,
        ),
        description: optionalString(
          template['description'],
          `resources/templates/list.resourceTemplates[${index}].description`,
        ),
        mimeType: optionalString(
          template['mimeType'],
          `resources/templates/list.resourceTemplates[${index}].mimeType`,
        ),
        annotations: optionalRecord(
          template['annotations'],
          `resources/templates/list.resourceTemplates[${index}].annotations`,
        ),
      };
    }),
    nextCursor: optionalCursor(input['nextCursor'], 'resources/templates/list'),
  };
}

export function parseReadResourceResult(value: unknown): MCPReadResourceResult {
  const input = record(value, 'resources/read result');
  if (!Array.isArray(input['contents'])) {
    throw new Error('Malformed MCP resources/read result: contents must be an array');
  }
  return {
    contents: input['contents'].map((value, index) => {
      const content = record(value, `resources/read.contents[${index}]`);
      const text = optionalString(content['text'], `resources/read.contents[${index}].text`);
      const blob = optionalString(content['blob'], `resources/read.contents[${index}].blob`);
      if (text === undefined && blob === undefined) {
        throw new Error(`Malformed MCP resources/read.contents[${index}]: expected text or blob`);
      }
      return {
        uri: requiredString(content['uri'], `resources/read.contents[${index}].uri`),
        mimeType: optionalString(content['mimeType'], `resources/read.contents[${index}].mimeType`),
        text,
        blob,
      };
    }),
  };
}

function parsePromptArgument(
  value: unknown,
  promptIndex: number,
  argIndex: number,
): MCPPromptArgument {
  const input = record(value, `prompts/list.prompts[${promptIndex}].arguments[${argIndex}]`);
  const required = input['required'];
  if (required !== undefined && typeof required !== 'boolean') {
    throw new Error(
      `Malformed MCP prompts/list.prompts[${promptIndex}].arguments[${argIndex}].required`,
    );
  }
  return {
    name: requiredString(
      input['name'],
      `prompts/list.prompts[${promptIndex}].arguments[${argIndex}].name`,
    ),
    description: optionalString(
      input['description'],
      `prompts/list.prompts[${promptIndex}].arguments[${argIndex}].description`,
    ),
    required: required as boolean | undefined,
  };
}

export function parseListPromptsResult(value: unknown): MCPListPromptsResult {
  const input = record(value, 'prompts/list result');
  if (!Array.isArray(input['prompts'])) {
    throw new Error('Malformed MCP prompts/list result: prompts must be an array');
  }
  return {
    prompts: input['prompts'].map((value, index) => {
      const prompt = record(value, `prompts/list.prompts[${index}]`);
      const args = prompt['arguments'];
      if (args !== undefined && !Array.isArray(args)) {
        throw new Error(`Malformed MCP prompts/list.prompts[${index}].arguments`);
      }
      return {
        name: requiredString(prompt['name'], `prompts/list.prompts[${index}].name`),
        title: optionalString(prompt['title'], `prompts/list.prompts[${index}].title`),
        description: optionalString(
          prompt['description'],
          `prompts/list.prompts[${index}].description`,
        ),
        arguments: args?.map((arg, argIndex) => parsePromptArgument(arg, index, argIndex)),
      };
    }),
    nextCursor: optionalCursor(input['nextCursor'], 'prompts/list'),
  };
}

export function parseGetPromptResult(value: unknown): MCPGetPromptResult {
  const input = record(value, 'prompts/get result');
  if (!Array.isArray(input['messages'])) {
    throw new Error('Malformed MCP prompts/get result: messages must be an array');
  }
  return {
    description: optionalString(input['description'], 'prompts/get.description'),
    messages: input['messages'].map((value, index) => {
      const message = record(value, `prompts/get.messages[${index}]`);
      const role = message['role'];
      if (role !== 'user' && role !== 'assistant') {
        throw new Error(`Malformed MCP prompts/get.messages[${index}].role`);
      }
      if (message['content'] === undefined) {
        throw new Error(`Malformed MCP prompts/get.messages[${index}].content`);
      }
      return { role, content: message['content'] };
    }),
  };
}

/**
 * Extract the `uri` from a `notifications/resources/updated` payload.
 *
 * The notification is the whole point of `resources/subscribe`, which the
 * client already supported — every transport parsed the three `list_changed`
 * notifications and silently dropped this one, so a subscription produced
 * nothing. Returns `undefined` for a malformed payload rather than throwing:
 * a notification has no reply, so a bad one is ignored, not answered.
 */
export function resourceUpdatedUri(params: unknown): string | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined;
  const uri = (params as { uri?: unknown }).uri;
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 4_096) return undefined;
  if (/[\r\n]/.test(uri)) return undefined;
  return uri;
}
