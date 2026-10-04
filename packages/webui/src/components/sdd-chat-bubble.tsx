import { Bot, CheckCheck, Copy, User } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Strip fenced ```json … ``` blocks (the machine-readable task array) from the
 * agent's plan text so the rendered plan stays prose-only and readable.
 */
export function stripJsonBlocks(text: string): string {
  const stripped = text.replace(/```json[\s\S]*?```/gi, '').trim();
  return stripped.length > 0 ? stripped : text.trim();
}

/** Extracts candidate quick-reply choices from agent question text. */
export function extractQuickReplies(text: string): string[] {
  if (!text) return [];
  const results: string[] = [];

  const listMatches = text.matchAll(
    /(?:^|\n)\s*(?:[0-9]+[.)]|[A-D][.)]|[-*]\s+\*\*|[-*]\s+\[)\s*([^:\n\r]+)/gi,
  );
  for (const m of listMatches) {
    const raw = (m[1] ?? '').trim().replace(/^[`"']|[`"']$/g, '');
    if (raw && raw.length > 2 && raw.length < 50 && !results.includes(raw)) {
      results.push(raw);
    }
  }

  if (results.length === 0) {
    const inlineMatch = text.match(/(?:Options|Choices|Öneriler|Seçenekler):\s*([^\n\r]+)/i);
    if (inlineMatch?.[1]) {
      const parts = inlineMatch[1]
        .split(/[,|/]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 2 && p.length < 45);
      results.push(...parts.slice(0, 4));
    }
  }

  return results.slice(0, 4);
}

/** Detects architectural topic badge from question content. */
export function detectTopicBadge(text: string): { label: string; color: string } | null {
  const lower = text.toLowerCase();
  if (/security|auth|jwt|oauth|token|permission|role|rbac|şifre|güvenlik/i.test(lower)) {
    return {
      label: 'Security & Auth',
      color: 'bg-destructive/10 text-destructive border-destructive/20',
    };
  }
  if (/database|sql|postgres|sqlite|redis|mongodb|schema|tablo|veritabanı/i.test(lower)) {
    return { label: 'Data & Storage', color: 'bg-info/10 text-info border-info/20' };
  }
  if (/api|endpoint|rest|graphql|grpc|route|http/i.test(lower)) {
    return { label: 'API & Routing', color: 'bg-success/10 text-success border-success/20' };
  }
  if (/test|vitest|jest|e2e|playwright|coverage|mock/i.test(lower)) {
    return { label: 'Testing & QA', color: 'bg-warning/10 text-warning border-warning/20' };
  }
  if (/ui|css|component|frontend|react|tailwind|button|view|görsel|arayüz/i.test(lower)) {
    return { label: 'UI & Layout', color: 'bg-primary/10 text-primary border-primary/20' };
  }
  if (/architecture|microservice|queue|worker|scale|mimari/i.test(lower)) {
    return { label: 'Architecture', color: 'bg-accent/30 text-accent-foreground border-border' };
  }
  return null;
}

/** One transcript message — agent question (left) or user answer (right). */
export function ChatBubble({
  speaker,
  text,
  live,
  thinking,
  questionIndex,
}: {
  speaker: 'assistant' | 'user';
  text: string;
  live?: boolean;
  thinking?: boolean;
  questionIndex?: number | undefined;
}): React.ReactElement {
  const isUser = speaker === 'user';
  const [copied, setCopied] = useState(false);
  const topicBadge = !isUser && text ? detectTopicBadge(text) : null;

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn('group sdd-rise flex items-start gap-2', isUser && 'flex-row-reverse')}>
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
          isUser ? 'bg-info/15 text-info' : 'bg-primary/15 text-primary',
          (live || thinking) && 'sdd-agent-live',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>

      <div
        className={cn(
          'relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm transition-all',
          isUser
            ? 'rounded-tr-sm bg-info/10 border border-info/20'
            : 'rounded-tl-sm bg-muted/80 border border-border/70',
        )}
      >
        {!isUser && !thinking && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px]">
            {questionIndex !== undefined && (
              <span className="rounded bg-primary/15 px-1.5 py-0.2 font-mono font-semibold text-primary">
                Q{questionIndex}
              </span>
            )}
            {topicBadge && (
              <span className={cn('rounded border px-1.5 py-0.2 font-medium', topicBadge.color)}>
                {topicBadge.label}
              </span>
            )}
          </div>
        )}

        {thinking ? (
          <span className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-200ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-100ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </span>
        ) : (
          <p className="whitespace-pre-wrap">{text}</p>
        )}

        {!thinking && text && (
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy'}
            className="absolute -bottom-2 right-2 hidden rounded bg-background/90 p-1 text-[10px] text-muted-foreground shadow border group-hover:flex items-center gap-1 hover:text-foreground"
          >
            {copied ? (
              <CheckCheck className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
