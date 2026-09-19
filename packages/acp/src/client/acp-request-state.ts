export interface PendingRequest {
  method: string;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timeoutMs: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export type State =
  | 'init'
  | 'ready'
  | 'authenticated'
  | 'sessioning'
  | 'prompting'
  | 'done'
  | 'closed';
