import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const options = [
  {
    value: 'light',
    label: 'Light',
    icon: Sun,
    description: 'A light appearance, whatever your device uses.',
    preview: 'bg-[#f8fafc]',
    window: 'border-[#cbd5e1] bg-white',
    lines: 'bg-[#bfcee9]',
    iconTone: 'border-[#cbd5e1] bg-[#f8fafc] text-[#526580]',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
    description: 'A dark appearance, whatever your device uses.',
    preview: 'bg-[#111a2a]',
    window: 'border-[#405475] bg-[#22344f]',
    lines: 'bg-[#536c92]',
    iconTone: 'border-[#405475] bg-[#17263e] text-[#b8c7e1]',
  },
  {
    value: 'system',
    label: 'System',
    icon: Monitor,
    description: 'Matches your device’s appearance.',
    preview: 'bg-[linear-gradient(115deg,#f8fafc_50%,#1c2942_50%)]',
    window: 'border-[#8d9fbc] bg-[linear-gradient(115deg,#ffffff_50%,#22344f_50%)]',
    lines: 'bg-[#91a5c7]',
    iconTone: 'border-[#8d9fbc] bg-[#edf2fb] text-[#526580]',
  },
] as const;

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((option) => mounted && option.value === theme) ?? options[2];
  const Icon = selected.icon;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const handleFocus = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Color theme: ${selected.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'h-10 w-10 gap-2 rounded-xl border border-transparent px-0 text-muted hover:bg-card hover:text-fg xl:w-auto xl:border-line xl:px-3',
          open && 'border-brand/40 bg-card text-brand',
        )}
      >
        <Icon className="size-4" />
        <span className="hidden xl:inline">{selected.label}</span>
        <ChevronDown
          className={cn('hidden size-3 transition-transform xl:block', open && 'rotate-180')}
        />
      </Button>
      {open && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-labelledby={`${id}-title`}
          className="fixed right-4 top-[82px] z-[60] max-h-[calc(100dvh-6rem)] w-[min(328px,calc(100vw-2rem))] overflow-y-auto rounded-[22px] border border-line bg-card p-5 text-fg shadow-2xl shadow-black/15 sm:absolute sm:right-0 sm:top-[calc(100%+12px)]"
        >
          <h2 id={`${id}-title`} className="text-sm font-bold">
            Appearance
          </h2>
          <p className="mt-1 text-xs text-muted">Your space, your style.</p>
          <fieldset className="mt-5">
            <legend className="sr-only">Color theme</legend>
            <div className="grid grid-cols-3 gap-3">
              {options.map((option) => (
                <label key={option.value} className="min-w-0 cursor-pointer text-center">
                  <input
                    type="radio"
                    name={`${id}-theme`}
                    value={option.value}
                    checked={selected.value === option.value}
                    onChange={() => setTheme(option.value)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative block aspect-[5/4] overflow-hidden rounded-lg border border-[#a8b6ce]/50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-brand',
                      option.preview,
                      selected.value === option.value &&
                        'ring-2 ring-brand ring-offset-2 ring-offset-card',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute -bottom-1 -right-2 left-3 top-3 rounded-tl-md border',
                        option.window,
                      )}
                    >
                      <span className="absolute inset-y-0 left-0 w-4 border-r border-[#8d9fbc]/40" />
                      <span className="absolute left-6 right-4 top-2.5 grid gap-1">
                        <span className={cn('h-[3px] w-2/3 rounded-full', option.lines)} />
                        <span className={cn('h-[3px] rounded-full opacity-65', option.lines)} />
                        <span
                          className={cn('h-[3px] w-3/4 rounded-full opacity-45', option.lines)}
                        />
                      </span>
                    </span>
                    <span
                      className={cn(
                        'absolute bottom-1.5 left-1.5 grid size-5 place-items-center rounded-full border',
                        option.iconTone,
                      )}
                    >
                      <option.icon className="size-3" />
                    </span>
                    {selected.value === option.value && (
                      <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-brand text-white">
                        <Check className="size-3" />
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'mt-3 block text-xs font-semibold',
                      selected.value === option.value ? 'text-brand' : 'text-muted',
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-[11px] leading-5 text-muted">
            <Icon className="mt-0.5 size-3.5 shrink-0" />
            {selected.description}
          </p>
        </div>
      )}
    </div>
  );
}
