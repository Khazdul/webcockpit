// May the page ask the community's API (stage 65, ADR 0155)? Its own small
// module (review fix CR6): the start page's menu and Published runs ask it
// without the community's API module (src/cloud/community/api.ts, which
// re-exports it).
import { accountsEnabled } from '../account/state';
import { apiAllowed, flagOn } from '../config';

/** What a request needs allowed: `read` (share, gallery), `runes` (and runes), `user` (and accounts), `userRunes` (all four). */
export type CommunityNeed = 'read' | 'runes' | 'user' | 'userRunes';

/** The flags a request of `need` asks for (never rejects; false on any failure). */
export async function communityAllowed(need: CommunityNeed): Promise<boolean> {
  try {
    if (!apiAllowed()) return false;
    if (!(await flagOn('share')) || !(await flagOn('gallery'))) return false;
    if ((need === 'runes' || need === 'userRunes') && !(await flagOn('runes'))) return false;
    if ((need === 'user' || need === 'userRunes') && !(await accountsEnabled())) return false;
    return true;
  } catch {
    return false;
  }
}
