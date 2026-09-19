import { pageParams, parseEmptyResult, validateProtocolString } from './client-protocol-helpers.js';
import type { MCPPageOptions, MCPRequestOptions } from './client-types.js';
import {
  type MCPGetPromptResult,
  type MCPListPromptsResult,
  type MCPListResourcesResult,
  type MCPListResourceTemplatesResult,
  type MCPReadResourceResult,
  parseGetPromptResult,
  parseListPromptsResult,
  parseListResourcesResult,
  parseListResourceTemplatesResult,
  parseReadResourceResult,
} from './protocol.js';

export class MCPCapabilityClient {
  constructor(
    private readonly requestCapability: <T>(
      capability: 'resources' | 'prompts',
      method: string,
      params: unknown,
      parse: (value: unknown) => T,
      opts: MCPRequestOptions,
    ) => Promise<T>,
    private readonly requireResourceSubscriptions: (method: string) => void,
  ) {}

  async listResources(opts: MCPPageOptions = {}): Promise<MCPListResourcesResult> {
    const params = pageParams(opts.cursor, 'resources/list cursor');
    return this.requestCapability(
      'resources',
      'resources/list',
      params,
      parseListResourcesResult,
      opts,
    );
  }

  async listResourceTemplates(opts: MCPPageOptions = {}): Promise<MCPListResourceTemplatesResult> {
    const params = pageParams(opts.cursor, 'resources/templates/list cursor');
    return this.requestCapability(
      'resources',
      'resources/templates/list',
      params,
      parseListResourceTemplatesResult,
      opts,
    );
  }

  async readResource(uri: string, opts: MCPRequestOptions = {}): Promise<MCPReadResourceResult> {
    validateProtocolString(uri, 'resource URI');
    return this.requestCapability(
      'resources',
      'resources/read',
      { uri },
      parseReadResourceResult,
      opts,
    );
  }

  async subscribeResource(uri: string, opts: MCPRequestOptions = {}): Promise<void> {
    validateProtocolString(uri, 'resource URI');
    this.requireResourceSubscriptions('resources/subscribe');
    await this.requestCapability(
      'resources',
      'resources/subscribe',
      { uri },
      parseEmptyResult,
      opts,
    );
  }

  async unsubscribeResource(uri: string, opts: MCPRequestOptions = {}): Promise<void> {
    validateProtocolString(uri, 'resource URI');
    this.requireResourceSubscriptions('resources/unsubscribe');
    await this.requestCapability(
      'resources',
      'resources/unsubscribe',
      { uri },
      parseEmptyResult,
      opts,
    );
  }

  async listPrompts(opts: MCPPageOptions = {}): Promise<MCPListPromptsResult> {
    const params = pageParams(opts.cursor, 'prompts/list cursor');
    return this.requestCapability('prompts', 'prompts/list', params, parseListPromptsResult, opts);
  }

  async getPrompt(
    name: string,
    args?: Record<string, string> | undefined,
    opts: MCPRequestOptions = {},
  ): Promise<MCPGetPromptResult> {
    validateProtocolString(name, 'prompt name');
    if (args && Object.keys(args).length > 64) {
      throw new Error('MCP prompt arguments exceed the limit of 64');
    }
    for (const [key, value] of Object.entries(args ?? {})) {
      validateProtocolString(key, 'prompt argument name');
      validateProtocolString(value, `prompt argument "${key}"`, true);
    }
    return this.requestCapability(
      'prompts',
      'prompts/get',
      args === undefined ? { name } : { name, arguments: args },
      parseGetPromptResult,
      opts,
    );
  }
}
