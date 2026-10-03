import type { DangerRule } from './_danger-types.js';

export const SYSTEM_DANGER_RULES: readonly DangerRule[] = [
  // ----- find -exec / -ok / -execdir -----
  {
    id: 'find-exec',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'find') return false;
      return args.some(
        (a) =>
          a === '-exec' ||
          a === '-exec;' ||
          a === '-ok' ||
          a === '-ok;' ||
          a === '-execdir' ||
          a === '-execdir;' ||
          a.startsWith('-exec=') ||
          a.startsWith('-ok=') ||
          a.startsWith('-execdir='),
      );
    },
    reason: 'find with -exec/-ok (executes arbitrary command on matches)',
  },

  // ----- git --exec= / --upload-pack= / --receive-pack= -----
  // These run arbitrary commands via the git transport layer.
  {
    id: 'git-exec',
    level: 'destructive',
    test: (cmd, args) =>
      cmd === 'git' &&
      args.some(
        (a) =>
          a.startsWith('--exec=') ||
          a.startsWith('--upload-pack=') ||
          a.startsWith('--receive-pack=') ||
          a === '--exec' ||
          a === '--upload-pack' ||
          a === '--receive-pack',
      ),
    reason: 'git with --exec/--upload-pack/--receive-pack (runs arbitrary code)',
  },

  // ----- Windows: format / diskpart / bcdedit -----
  {
    id: 'win32-format',
    level: 'destructive',
    test: (cmd) => cmd === 'format' || cmd === 'format.exe',
    reason: 'format (Windows disk format)',
  },

  {
    id: 'win32-diskpart',
    level: 'destructive',
    test: (cmd) => cmd === 'diskpart' || cmd === 'diskpart.exe',
    reason: 'diskpart (Windows partition editor)',
  },

  {
    id: 'win32-bcdedit',
    level: 'destructive',
    test: (cmd) => cmd === 'bcdedit' || cmd === 'bcdedit.exe',
    reason: 'bcdedit (Windows boot config editor)',
  },

  // ----- mkfs family -----
  {
    id: 'mkfs',
    level: 'destructive',
    // Case-insensitive like every sibling rule: an argv reaching this module is
    // whatever the model wrote, and on a case-insensitive filesystem `MKFS.EXT4`
    // runs the same binary. Case-sensitive matching here made the one spelling
    // difference the whole classification (probe-verified 2026-09-22).
    test: (cmd) => /^mkfs(\.[a-z0-9]+)?$/i.test(cmd) || /^mkswap$/i.test(cmd),
    reason: 'mkfs (filesystem creation — destroys existing data)',
  },

  // ----- dd writing to a block device -----
  {
    id: 'dd-to-block-device',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'dd') return false;
      return args.some((a) => /of=\/dev\/(sd|hd|nvme|vd|mmcblk|xvd|loop|disk)/.test(a));
    },
    reason: 'dd writing to a block device',
  },

  // ----- Secure-erase tools -----
  {
    id: 'shred',
    level: 'destructive',
    test: (cmd) => cmd === 'shred' || cmd === 'shred.exe',
    reason: 'shred (secure file delete)',
  },

  {
    id: 'wipefs',
    level: 'destructive',
    test: (cmd) => cmd === 'wipefs' || cmd === 'wipefs.exe',
    reason: 'wipefs (signature wipe — destroys filesystem headers)',
  },

  // Whole-disk destroyers the YOLO gate's disk-wipe kind also covers:
  // `sgdisk` only with a zap/clear option (`-Z` --zap-all, `-z` --zap, `-o`
  // --clear; `-p`/`-v`/`-O` are read-only prints), and `blkdiscard`, which
  // TRIMs every block of the device.
  {
    id: 'sgdisk-zap',
    level: 'destructive',
    test: (cmd, args) =>
      /^sgdisk(?:\.exe)?$/i.test(cmd) &&
      args.some(
        (a) =>
          a === '--zap-all' ||
          a === '--zap' ||
          a === '--clear' ||
          /^-[a-zA-Z]*[zZo][a-zA-Z]*$/.test(a),
      ),
    reason: 'sgdisk --zap-all / --clear (destroys the partition tables)',
  },

  {
    id: 'blkdiscard',
    level: 'destructive',
    test: (cmd) => /^blkdiscard(?:\.exe)?$/i.test(cmd),
    reason: 'blkdiscard (discards every block of the device)',
  },

  {
    id: 'sdelete',
    level: 'destructive',
    test: (cmd) => cmd === 'sdelete' || cmd === 'sdelete.exe',
    reason: 'sdelete (Sysinternals secure delete)',
  },
];
