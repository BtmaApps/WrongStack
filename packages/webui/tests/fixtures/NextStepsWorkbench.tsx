import { ChatInput } from '@/components/ChatInput';
import { MessageBubble } from '@/components/MessageBubble';
import { Toaster } from '@/components/Toaster';
import { useChatStore } from '@/stores';

const message = {
  id: 'next-steps-preview',
  role: 'assistant' as const,
  content: 'Choose the next steps for this workspace, or add an instruction of your own.',
  timestamp: Date.now(),
  nextSteps: {
    steps: [
      { index: 1, text: 'Run the focused tests' },
      { index: 2, text: 'Review the changes' },
      { index: 3, text: 'Update the documentation' },
    ],
  },
};

export function seedNextStepsWorkbench() {
  useChatStore.getState().setMessages([message]);
  useChatStore.getState().setLoading(false);
}

export function NextStepsWorkbench() {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <MessageBubble message={message} />
        </div>
      </div>
      <div className="shrink-0 p-3">
        <ChatInput />
      </div>
      <Toaster />
    </>
  );
}
