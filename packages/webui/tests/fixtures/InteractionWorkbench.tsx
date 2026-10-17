import { useState } from 'react';
import { ThinkingBubble } from '@/components/ChatView/ThinkingBubble';
import { InspectorPanel } from '@/components/InspectorPanel';
import { MessageBubble } from '@/components/MessageBubble';
import { CopyButton } from '@/components/MessageBubble/CopyButton';
import { ToolLedgerCard } from '@/components/MessageBubble/ToolLedgerCard';
import { ModelPicker } from '@/components/ModelPicker';
import { QueuePanel } from '@/components/QueuePanel';
import { SessionTabBar } from '@/components/SessionTabBar';
import { Toaster, toast } from '@/components/Toaster';
import { Button } from '@/components/ui/button';
import { PickerCardList } from '@/components/ui/PickerCardList';
import { useChatStore, useHistoryStore, useSessionTabStore, useUIStore } from '@/stores';

export function seedInteractionWorkbench() {
  useHistoryStore.getState().setEntries(
    ['Workspace design', 'Review and verification'].map((title, i) => ({
      id: `visual-session-${i}`,
      title,
      startedAt: new Date().toISOString(),
      model: 'workspace-model',
      provider: 'WrongForge',
      tokenTotal: 0,
    })),
  );
  useSessionTabStore.getState().openTab('visual-session-0');
  useSessionTabStore.getState().openTab('visual-session-1');
  useChatStore
    .getState()
    .appendThinking('Reviewing the workspace surfaces and checking responsive layouts…');
  useChatStore.getState().enqueue('Review the updated SVG illustrations', 'queue');
  useChatStore.getState().enqueue('Check mobile layouts and keyboard focus', 'steer');
}

export function InteractionWorkbench() {
  const [status, setStatus] = useState<'running' | 'success' | 'error'>('running');
  const [queueOpen, setQueueOpen] = useState(false);
  const [model, setModel] = useState('');
  const [selection, setSelection] = useState('design');
  return (
    <>
      <SessionTabBar />
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6" data-testid="interaction-workbench">
        <div className="mx-auto flex max-w-4xl min-w-0 flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStatus('running')}>Run tool</Button>
            <Button variant="outline" onClick={() => setStatus('success')}>
              Complete tool
            </Button>
            <Button variant="outline" onClick={() => setStatus('error')}>
              Fail tool
            </Button>
            <Button variant="outline" onClick={() => setQueueOpen(true)}>
              Open queue
            </Button>
            <Button
              variant="outline"
              onClick={() => useUIStore.setState({ inspectorOpen: true, inspectorTab: 'fleet' })}
            >
              Open inspector
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.success('Workspace review complete', 20000)}
            >
              Show notification
            </Button>
          </div>
          <MessageBubble
            message={{
              id: 'visual-user',
              role: 'user',
              content: 'Polish every workspace surface, including mobile layouts and animations.',
              timestamp: Date.now(),
            }}
          />
          <MessageBubble
            message={{
              id: 'visual-assistant',
              role: 'assistant',
              content:
                'The workspace now shares a consistent visual language. **Motion follows activity**, and every interaction remains available with reduced motion.',
              timestamp: Date.now(),
            }}
          />
          <ThinkingBubble />
          <ToolLedgerCard
            message={{
              id: 'visual-tool',
              role: 'tool',
              content: '',
              timestamp: Date.now(),
              toolName: 'run_command',
              toolInput: { command: 'bun run typecheck' },
              ...(status === 'running'
                ? {}
                : {
                    toolResult:
                      status === 'success'
                        ? 'Workspace validation complete.\nNo diagnostics found.'
                        : 'Validation failed. Inspect the reported diagnostics.',
                    isError: status === 'error',
                  }),
            }}
          />
          <div
            className="rounded-xl border border-border bg-card p-4"
            data-testid="interaction-model"
          >
            <ModelPicker
              value={model || undefined}
              placeholder="Choose a workspace model"
              candidates={[
                {
                  provider: 'WrongForge',
                  model: 'design',
                  label: 'Design model',
                  description: 'Layout and interaction design',
                },
                {
                  provider: 'WrongForge',
                  model: 'review',
                  label: 'Review model',
                  description: 'Quality and verification',
                },
              ]}
              onPick={(next) => setModel(next)}
              onReset={() => setModel('')}
            />
          </div>
          <PickerCardList
            options={[
              { id: 'design', label: 'Design workspace', sublabel: 'Visual refinement' },
              { id: 'review', label: 'Review workspace', sublabel: 'Verification and delivery' },
            ]}
            selectedId={selection}
            onSelect={setSelection}
          />
          <CopyButton text="Workspace copy verification" label="Copy workspace summary" />
        </div>
      </div>
      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
      <InspectorPanel />
      <Toaster />
    </>
  );
}
