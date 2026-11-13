import { describe, expect, it } from 'vitest';
import { isAssetName, parseRelease, releaseJson, versionGuard } from '../../scripts/release.ts';

describe('release manifest (ADR 0025, ADR 0028)', () => {
  it('round-trips a release', () => {
    const text = releaseJson({ version: '0.2.0', commit: 'abc1234', dirty: false, assets: ['a-1.js'] }, new Date(0));
    expect(parseRelease(text)).toEqual({
      version: '0.2.0',
      commit: 'abc1234',
      dirty: false,
      publishedAt: '1970-01-01T00:00:00.000Z',
      assets: ['a-1.js'],
    });
  });

  it('reads the minimal manifest vite build emits, and rejects what is not one', () => {
    expect(parseRelease('{"version":"0.1.0","commit":"dev"}')).toMatchObject({ version: '0.1.0', assets: [] });
    expect(parseRelease('<html>404</html>')).toBeNull();
    expect(parseRelease('null')).toBeNull();
    expect(parseRelease('{"version":1}')).toBeNull();
  });

  it('only accepts plain file names as carried assets', () => {
    expect(isAssetName('index-C9W5HDPB.js')).toBe(true);
    expect(isAssetName('../index.html')).toBe(false);
    expect(isAssetName('a/b.js')).toBe(false);
    expect(isAssetName('..')).toBe(false);
  });
});

describe('release version guard (ADR 0025, ADR 0144)', () => {
  const live = { version: '0.1.0', commit: 'abc1234' };

  it('allows a first release and a new version', () => {
    expect(versionGuard(null, { version: '0.1.0', commit: 'abc1234' })).toBeNull();
    expect(versionGuard(live, { version: '0.1.1', commit: 'def5678' })).toBeNull();
    expect(versionGuard(live, { version: '0.1.1', commit: 'abc1234' })).toBeNull();
  });

  it('refuses the live version from another commit, saying how to bump', () => {
    const msg = versionGuard(live, { version: '0.1.0', commit: 'def5678' });
    expect(msg).toContain('0.1.0 is already live');
    expect(msg).toContain('abc1234');
    expect(msg).toContain('npm version patch --no-git-tag-version');
  });

  it('allows the live release again: the same version and commit', () => {
    expect(versionGuard(live, { version: '0.1.0', commit: 'abc1234' })).toBeNull();
    // Abbreviated to different lengths in two checkouts.
    expect(versionGuard(live, { version: '0.1.0', commit: 'abc12345f' })).toBeNull();
    expect(versionGuard({ version: '0.1.0', commit: 'abc12345f' }, live)).toBeNull();
    expect(versionGuard({ version: '0.1.0', commit: '' }, live)).toContain('already live');
  });
});
