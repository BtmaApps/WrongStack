import { describe, expect, it } from 'vitest';
import { classifyDestructiveCommand } from '../../src/security/yolo-risk.js';

const ROOT = '/home/user/project';

describe('YOLO single ampersand command boundary', () => {
  it.each(['&&', '&'])('does not attribute a later command path across %s', (separator) => {
    expect(
      classifyDestructiveCommand(`rm -rf ./dist ${separator} echo ../outside`, ROOT),
    ).toBeUndefined();
  });

  it('still gates a real project-escaping delete before a background separator', () => {
    expect(classifyDestructiveCommand('rm -rf ~/cache & echo ok', ROOT)).toBe('delete-outside');
  });
});
