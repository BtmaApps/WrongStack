import { describe, expect, it } from 'vitest';
import {
  detectNinepStoreMount,
  mountFsTypeFor,
  NINEP_STORE_MOUNT_FS_TYPES,
  ninepStoreRefusalMessage,
  parseProcMounts,
} from '../src/mount-probe.js';

const MOUNTS = [
  '/dev/sda1 / ext4 rw,relatime 0 0',
  'none /proc proc rw,nosuid,nodev,noexec,relatime 0 0',
  'tmpfs /dev/shm tmpfs rw,nosuid,nodev 0 0',
  'C:\\ /mnt/c drvfs rw,relatime,uid=1000,gid=1000 0 0',
  'D:\\ /mnt/d drvfs rw,relatime,uid=1000,gid=1000 0 0',
  '/dev/sdb1 /mnt/with\\040space ext4 rw,relatime 0 0',
].join('\n');

describe('parseProcMounts', () => {
  it('decodes octal escapes in mount points and keeps fs types', () => {
    const entries = parseProcMounts(MOUNTS);
    const spaced = entries.find((entry) => entry.mountPoint === '/mnt/with space');
    expect(spaced?.fsType).toBe('ext4');
    expect(entries.find((entry) => entry.mountPoint === '/mnt/d')?.fsType).toBe('drvfs');
  });

  it('skips malformed lines instead of throwing', () => {
    expect(parseProcMounts('\nonlytwo\n')).toEqual([]);
  });
});

describe('mountFsTypeFor', () => {
  it('resolves the longest covering mount point', () => {
    const mounts = [
      '/dev/sda1 / ext4 rw 0 0',
      'C:\\ /mnt/c drvfs rw 0 0',
      '/dev/sdb2 /mnt/c/overlay ext4 rw 0 0',
    ].join('\n');
    expect(mountFsTypeFor(mounts, '/mnt/c/Users/ersin')).toBe('drvfs');
    expect(mountFsTypeFor(mounts, '/mnt/c/overlay/store')).toBe('ext4');
    expect(mountFsTypeFor(mounts, '/home/ersinkoc')).toBe('ext4');
  });

  it('never matches a sibling prefix like /mnt/database for /mnt/d', () => {
    const mounts = 'D:\\ /mnt/d drvfs rw 0 0';
    expect(mountFsTypeFor(mounts, '/mnt/database/store')).toBeNull();
  });
});

describe('detectNinepStoreMount', () => {
  it('flags 9p-family stores and passes local filesystems through', () => {
    expect(detectNinepStoreMount('/mnt/d/repo/.wrongstack/memories', MOUNTS)).toBe('drvfs');
    expect(detectNinepStoreMount('/home/ersinkoc/repo/.wrongstack/memories', MOUNTS)).toBeNull();
    expect(detectNinepStoreMount('/mnt/d/repo', null)).toBeNull();
  });

  it('covers the documented 9p family', () => {
    expect([...NINEP_STORE_MOUNT_FS_TYPES].sort()).toEqual(['9p', 'drvfs', 'wslfs']);
  });
});

describe('ninepStoreRefusalMessage', () => {
  it('names the store, mount type, sqlite failure, and both remedies', () => {
    const message = ninepStoreRefusalMessage('/mnt/d/repo/.wrongstack/memories', 'drvfs');
    expect(message).toContain('drvfs');
    expect(message).toContain('/mnt/d/repo/.wrongstack/memories');
    expect(message).toContain('SQLITE_IOERR_SHMOPEN');
    expect(message).toContain('Windows side');
    expect(message).toContain('ext4');
  });
});
