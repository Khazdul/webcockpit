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

describe('release version guard (ADR 0025)', () => {
  it('allows a first release and a new version', () => {
    expect(versionGuard(null, '0.1.0')).toBeNull();
    expect(versionGuard('0.1.0', '0.1.1')).toBeNull();
  });

  it('refuses the version that is already live, saying how to bump', () => {
    const msg = versionGuard('0.1.0', '0.1.0');
    expect(msg).toContain('0.1.0 is already live');
    expect(msg).toContain('npm version patch --no-git-tag-version');
  });
});
