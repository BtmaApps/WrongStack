/** Curated public release copy; the version guard requires a refresh on every release. */
export const releaseHighlights = {
  version: '1.2.1',
  title: 'See the work. Shape the workspace.',
  summary:
    'SimpleUI is retired and replaced by VibeUI, the focused browser surface behind wstack vibeui and --vibeui. The interactive launch menu is now TUI / REPL, WebUI, VibeUI, HQ and Desktop, and the retired --full-auto shortcut is ignored with a warning in favour of --yolo.',
  socialDescription:
    'WrongStack 1.2.1: SimpleUI is retired and replaced by VibeUI, the focused browser surface, with a reworked launch menu and --yolo replacing --full-auto.',
  cards: [
    {
      title: 'One browser surface',
      body: 'SimpleUI is retired: the @wrongstack/simpleui package is gone and VibeUI (wstack vibeui or --vibeui, default port 3476) is the focused browser surface. The retired wstack simpleui command and --simpleui flag still parse, but open VibeUI and print a notice.',
      href: '/interfaces',
      linkLabel: 'Compare the interfaces',
    },
    {
      title: 'A launch menu that matches reality',
      body: 'The interactive launch menu is now TUI / REPL, WebUI, VibeUI, HQ and Desktop, with VibeUI as option 3 and the retired SimpleUI entry gone.',
      href: '/interfaces',
      linkLabel: 'Explore VibeUI and the surfaces',
    },
    {
      title: 'Autonomy you ask for explicitly',
      body: 'The --full-auto shortcut is retired: it is still accepted but ignored with a warning. Use --yolo to run YOLO and autonomy together.',
      href: '/features',
      linkLabel: 'See the feature set',
    },
  ],
} as const;
