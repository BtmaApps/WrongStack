export type { ProviderCustomModelWire } from './provider-custom-model-wire.js';

import type { ClientMessageRuntime } from './client-message-runtime.js';
import type { ClientMessageServices } from './client-message-services.js';
import type { ClientMessageSettings } from './client-message-settings.js';
import type { ClientMessageWorkflows } from './client-message-workflows.js';

export type WSClientMessageCore =
  | ClientMessageRuntime
  | ClientMessageSettings
  | ClientMessageServices
  | ClientMessageWorkflows;
export type WSClientMessage = WSClientMessageCore;
