/** Browser projection: no remote IDs, account binding, input hashes or lease tokens. */
export interface MCPTaskView {
  id: string;
  server: string;
  tool: string;
  status: 'working' | 'input_required' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  lastUpdatedAt: string;
  delivered: boolean;
  observing: boolean;
}
