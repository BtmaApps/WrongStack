'use client';

import {
  BookOpen,
  Brain,
  Coffee,
  Folder,
  Footprints,
  Moon,
  Sparkles,
  StretchHorizontal,
  X,
} from 'lucide-react';
import { Popover, Tabs } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import {
  MASCOT_HOME,
  MASCOT_REACTION_MS,
  type MascotGesture,
  mascotMoveDuration,
  mascotState,
  mascotStopIndex,
  mascotWaypoints,
} from '../lib/mascot';
import { VibeBuddy } from './vibe-visuals';
import { useWorkspacePreferences } from './workspace-preferences';

export function RoamingMascot({
  working,
  connected,
  outcome,
  attention = false,
  onFiles,
  onIdeas,
  onMemory,
  onNewChat,
  newChatLocked = false,
}: {
  working: boolean;
  connected: boolean;
  outcome: 'done' | 'aborted' | 'error' | null;
  attention?: boolean;
  onFiles: () => void;
  onIdeas: () => void;
  onMemory: () => void;
  onNewChat: () => void;
  newChatLocked?: boolean;
}) {
  const { preferences, update } = useWorkspacePreferences();
  const enabled = preferences.view === 'cozy' && preferences.mascot !== 'off';
  const home = useRef<HTMLSpanElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const animation = useRef<Animation | null>(null);
  const step = useRef(0);
  const previousGeometry = useRef(-1);
  const [geometry, setGeometry] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [typing, setTyping] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [obscured, setObscured] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState('play');
  const [moving, setMoving] = useState(false);
  const [canRoam, setCanRoam] = useState(false);
  const [reaction, setReaction] = useState<{ gesture: MascotGesture; id: number } | null>(null);
  const reactionCounter = useRef(0);
  const playfulMotion = preferences.mascot === 'roam' && !reduced;
  const play = (gesture: MascotGesture) => setReaction({ gesture, id: ++reactionCounter.current });
  const reactionText = !reaction
    ? 'Tap me for a high five.'
    : !playfulMotion
      ? 'A quiet little smile, just for you.'
      : reaction.gesture === 'highfive'
        ? 'Right back at you!'
        : reaction.gesture === 'dance'
          ? 'A tiny dance, just for you.'
          : 'A little stretch feels lovely.';
  const { mood, status } = mascotState({ connected, working, outcome, attention });

  useEffect(() => {
    if (!enabled || !reaction) {
      if (!enabled) setReaction(null);
      return;
    }
    const timer = setTimeout(() => setReaction(null), MASCOT_REACTION_MS);
    return () => clearTimeout(timer);
  }, [enabled, reaction]);

  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReduced(media.matches);
    const syncFocus = () =>
      setTyping(
        Boolean(
          document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'),
        ),
      );
    const syncVisibility = () => setHidden(document.hidden);
    const syncOverlays = () =>
      setObscured(
        Boolean(
          document.querySelector(
            '[role="dialog"], .workspace-panel, .sidebar-backdrop, [role="listbox"]',
          ),
        ),
      );
    const syncGeometry = () => setGeometry((value) => value + 1);
    syncMotion();
    syncFocus();
    syncVisibility();
    syncOverlays();
    media.addEventListener('change', syncMotion);
    document.addEventListener('focusin', syncFocus);
    document.addEventListener('focusout', syncFocus);
    document.addEventListener('visibilitychange', syncVisibility);
    const observer = new MutationObserver(syncOverlays);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'hidden', 'class'],
    });
    const resize = new ResizeObserver(syncGeometry);
    const workspace = home.current?.closest('.main-workspace');
    if (workspace) resize.observe(workspace);
    const composer = workspace?.querySelector('.composer-area');
    if (composer) resize.observe(composer);
    const conversation = workspace?.querySelector('.conversation');
    if (conversation) resize.observe(conversation);
    return () => {
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('focusin', syncFocus);
      document.removeEventListener('focusout', syncFocus);
      document.removeEventListener('visibilitychange', syncVisibility);
      observer.disconnect();
      resize.disconnect();
    };
  }, [enabled]);

  useEffect(() => {
    const button = actor.current;
    const anchor = home.current;
    if (!enabled || !button || !anchor) return;
    const workspace = anchor.closest('.main-workspace');
    const composer = workspace?.querySelector('.composer-area');
    const conversation = workspace?.querySelector('.conversation');
    if (!workspace || !composer || !conversation) return;
    const frame = workspace.getBoundingClientRect();
    const origin = anchor.getBoundingClientRect();
    const stops = mascotWaypoints({
      width: frame.width,
      height: frame.height,
      contentTop: conversation.getBoundingClientRect().top - frame.top,
      composerTop: composer.getBoundingClientRect().top - frame.top,
    });
    const permitted = preferences.mascot === 'roam' && !reduced && connected && stops.length > 0;
    setCanRoam(permitted);
    setMoving(false);
    if (!permitted || previousGeometry.current !== geometry) button.style.transform = MASCOT_HOME;
    previousGeometry.current = geometry;
    if (
      !permitted ||
      hovered ||
      focused ||
      menuOpen ||
      typing ||
      hidden ||
      obscured ||
      reaction !== null ||
      typeof button.animate !== 'function'
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const schedule = () => {
      timer = setTimeout(
        () => {
          if (disposed) return;
          const stop = stops[mascotStopIndex(step.current++)]!;
          const current = button.getBoundingClientRect();
          const distance = Math.hypot(
            stop.x - (current.left - frame.left),
            stop.y - (current.top - frame.top),
          );
          const target = `translate(${stop.x - (origin.left - frame.left)}px, ${stop.y - (origin.top - frame.top)}px) scale(1)`;
          const player = button.animate(
            [{ transform: getComputedStyle(button).transform }, { transform: target }],
            {
              duration: mascotMoveDuration(distance),
              easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              fill: 'forwards',
            },
          );
          animation.current = player;
          setMoving(true);
          player.onfinish = () => {
            if (disposed) return;
            button.style.transform = target;
            player.onfinish = null;
            player.cancel();
            animation.current = null;
            setMoving(false);
            schedule();
          };
        },
        step.current === 0 ? 10000 : step.current % 2 ? 14000 : 12000,
      );
    };
    schedule();
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (animation.current) {
        button.style.transform = getComputedStyle(button).transform;
        animation.current.onfinish = null;
        animation.current.cancel();
        animation.current = null;
      }
    };
  }, [
    enabled,
    preferences.mascot,
    connected,
    reduced,
    geometry,
    hovered,
    focused,
    menuOpen,
    typing,
    hidden,
    obscured,
    reaction,
  ]);

  if (!enabled) return null;
  return (
    <span
      className="stacky-home"
      ref={home}
      data-roaming={
        canRoam && !typing && !obscured && !hidden && !menuOpen && !hovered && !focused && !reaction
      }
      data-moving={moving}
      data-mood={mood}
      data-gesture={reaction?.gesture || 'none'}
      data-playful={playfulMotion}
    >
      <Popover.Root
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) setMenuTab('play');
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            ref={actor}
            className="stacky-companion"
            aria-label="Meet Stacky"
            title="Stacky · click to tuck me in"
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <span
              className="stacky-performer"
              data-gesture={reaction?.gesture || 'none'}
              data-playful={playfulMotion}
            >
              <VibeBuddy key={reaction?.id || 0} mood={mood} gesture={reaction?.gesture} />
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="stacky-menu"
            sideOffset={8}
            collisionPadding={12}
            aria-label="Stacky companion"
          >
            <div className="stacky-menu-heading">
              <strong>Hi, I’m Stacky.</strong>
              <div className="stacky-menu-actions">
                <Popover.Close className="icon-button" aria-label="Close Stacky menu">
                  <X size={14} />
                </Popover.Close>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Put Stacky to sleep"
                  title="Sleep · hide"
                  onClick={() => {
                    setMenuOpen(false);
                    update({ mascot: 'off' });
                  }}
                >
                  <Moon size={14} />
                </button>
              </div>
            </div>
            <p>{status}</p>
            <button
              type="button"
              className="stacky-new-chat"
              disabled={newChatLocked}
              onClick={() => {
                setMenuOpen(false);
                onNewChat();
              }}
            >
              <Sparkles size={15} />
              <span>
                <strong>New chat</strong>
                <small>Start a fresh conversation</small>
              </span>
            </button>
            <Tabs.Root value={menuTab} onValueChange={setMenuTab}>
              <Tabs.List className="stacky-tabs" aria-label="Stacky spaces">
                <Tabs.Trigger value="play">Play</Tabs.Trigger>
                <Tabs.Trigger value="help">Help</Tabs.Trigger>
                <Tabs.Trigger value="comfort">Comfort</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="play">
                <div className="stacky-playground">
                  <button
                    type="button"
                    className="stacky-highfive"
                    aria-label="Give Stacky a high five"
                    onClick={() => play('highfive')}
                  >
                    <span
                      className="stacky-performer"
                      data-gesture={reaction?.gesture || 'none'}
                      data-playful={playfulMotion}
                    >
                      <VibeBuddy key={reaction?.id || 0} mood={mood} gesture={reaction?.gesture} />
                    </span>
                  </button>
                  <p role="status" className="stacky-reaction-text">
                    {reactionText}
                  </p>
                  <div className="stacky-tricks">
                    <button type="button" onClick={() => play('dance')}>
                      <Sparkles size={13} /> Little dance
                    </button>
                    <button type="button" onClick={() => play('stretch')}>
                      <StretchHorizontal size={13} /> Big stretch
                    </button>
                  </div>
                </div>
              </Tabs.Content>
              <Tabs.Content value="help">
                <div className="stacky-help">
                  <p>A small shortcut to whatever you need next.</p>
                  {(
                    [
                      ['My files', 'Look around your project', Folder, onFiles],
                      ['Ideas & skills', 'Find a starting point', BookOpen, onIdeas],
                      ['Memory', 'Explore remembered knowledge', Brain, onMemory],
                    ] as const
                  ).map(([title, detail, Icon, open]) => (
                    <button
                      type="button"
                      key={title}
                      onClick={() => {
                        setMenuOpen(false);
                        open();
                      }}
                    >
                      <Icon size={17} />
                      <span>
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </Tabs.Content>
              <Tabs.Content value="comfort">
                <div className="stacky-choices">
                  {(
                    [
                      ['roam', 'Wander a little', Footprints],
                      ['quiet', 'Sit quietly', Coffee],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={preferences.mascot === value}
                      onClick={() => {
                        setMenuOpen(false);
                        update({ mascot: value });
                      }}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="stacky-comfort-note">
                  {reduced
                    ? 'Your reduced-motion setting keeps me still.'
                    : 'I stay by the edge, and rest while you type.'}
                </p>
              </Tabs.Content>
            </Tabs.Root>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}
