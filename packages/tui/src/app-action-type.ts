import type { AppActionRuntime } from './app-action-runtime.js';
import type { AppActionServices } from './app-action-services.js';
import type { AppActionSettings } from './app-action-settings.js';
import type { AppActionWorkflows } from './app-action-workflows.js';
export type Action =
  | AppActionRuntime
  | AppActionSettings
  | AppActionServices
  | AppActionWorkflows
  | { type: 'fleetBatch'; actions: Action[] };
