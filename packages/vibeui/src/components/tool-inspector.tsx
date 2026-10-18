'use client';

import { TerminalSquare } from 'lucide-react';
import { Tabs } from 'radix-ui';
import type { ToolEntry } from '../lib/session';
import { CodePanel } from './code-panel';
import { ContentView } from './content-view';
import { Modal } from './dialogs';
import { usePresentation } from './presentation-mode';

export function ToolInspector({ tool, onClose }: { tool: ToolEntry; onClose: () => void }) {
  const { mode } = usePresentation();
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={tool.name}
      description="Inspect this tool call without leaving the conversation."
      icon={<TerminalSquare size={20} />}
      wide
      detailToggle
    >
      <div className="tool-inspector-status">
        <span
          className={`status-dot ${tool.status === 'running' ? 'busy' : tool.status === 'error' || tool.status === 'interrupted' ? 'error' : ''}`}
        />
        <span>
          {tool.status === 'done'
            ? 'Completed'
            : tool.status === 'running'
              ? 'Running'
              : tool.status === 'error'
                ? 'Failed'
                : 'Interrupted'}
        </span>
        {mode === 'extended' && <code>Call ID · {tool.id}</code>}
      </div>
      <Tabs.Root defaultValue="output">
        <Tabs.List className="tab-list tool-inspector-tabs" aria-label="Tool call content">
          <Tabs.Trigger value="output">Result</Tabs.Trigger>
          <Tabs.Trigger value="input">Arguments</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="output" className="tool-inspector-content">
          {tool.output ? (
            <ContentView value={tool.output} label="Tool result" copyLabel="Copy tool result" />
          ) : (
            <p className="panel-hint">
              {tool.status === 'running'
                ? 'Waiting for the tool to return a result…'
                : 'This call returned no text output.'}
            </p>
          )}
        </Tabs.Content>
        <Tabs.Content value="input" className="tool-inspector-content">
          <CodePanel
            value={JSON.stringify(tool.input, null, 2) ?? 'No arguments reported.'}
            label="Arguments"
            copyLabel="Copy tool arguments"
            defaultView="tree"
          />
        </Tabs.Content>
      </Tabs.Root>
    </Modal>
  );
}
