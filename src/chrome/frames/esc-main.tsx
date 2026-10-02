// ESC menu main frame (Inv §4.2, §4.3) and Exit confirm with the rating
// row (§4.6, ADR 0018).
//
//   Profile: default  ·  Link: 38ms  ·  capture: recording     (C_HINT)
//     then the client notices (ADR 0025): `Update: 0.1.3` (C_YELLOW),
//     `Storage: not saved` (C_ERR), each with a tooltip
//   banner (6 Hz, dropped when short)
//   Continue (connected) · Reconnect · Statistics (while a run is on) ·
//   Profile · Options · Exit session
//   flash row
//   ↑↓ Navigate · Enter Select · ESC Close

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type AppStatusState, type AppStatusView, formatLink, isLive } from '../../app/status';
import { Banner } from '../banner';
import { BANNER_H, bannerFits } from '../banner-data';
import { useGrid, useNotices, useServices, useSettings, useStatus } from '../kit/hooks';
import { type NoticeState, noticeIndicators } from '../../app/notices';
import { cellLen, centreLeft } from '../kit/nav';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Centered,
  FlashRow,
  Footer,
  type MenuItem,
  MenuRows,
  Page,
  STARS_W,
  Stars,
  indent,
  menuKey,
  ratingKey,
  useMenuCursor,
} from '../kit/widgets';
import type { LiveRuns } from '../../runs/live';
import { OptionsHub } from './options';
import { LiveStatsFrame } from './statistics';
import { type ApplyResult, editProfile } from './profile-edit';

export interface EscActions {
  status: AppStatusView;
  /** Close the menu (Continue, ESC). */
  close: () => void;
  /** Reconnect and close. */
  reconnect: () => void;
  /** End the session and return to the start page. */
  exit: () => void;
  /** The live profile apply (Inv §4.5, ADR 0015). Absent: Apply only saves. */
  liveApply?: (text: string) => ApplyResult;
  /** Saves pending runtime variable values before the editor reads the profile. */
  flushWriteBack?: () => Promise<void>;
  /** The live run (`app.runs`): Statistics and the Exit rating. Absent: neither is offered. */
  runs?: LiveRuns;
}

export interface EscMainProps extends EscActions {
  /** Row the cursor starts on. */
  preselect: 'continue' | 'reconnect';
}

/** Link colour (Inv §4.3): unknown → C_ERR, suspect → C_YELLOW, else C_HINT. */
export function linkClass(s: Readonly<AppStatusState>): string {
  if (s.linkMs === null) return 'wc-c-err';
  return s.linkSuspect ? 'wc-c-yellow' : 'wc-c-hint';
}

/** The status header parts: `Profile: x`, `Link: 38ms`, capture text, then the notices. */
export function headerParts(
  profile: string,
  s: Readonly<AppStatusState>,
  notices?: Readonly<NoticeState>,
  running = '',
): { text: string; cls: string; title?: string }[] {
  const parts: { text: string; cls: string; title?: string }[] = [
    { text: `Profile: ${profile}`, cls: 'wc-c-hint' },
    { text: formatLink(s.linkMs, s.linkSuspect), cls: linkClass(s) },
  ];
  if (s.capture) parts.push({ text: s.capture, cls: 'wc-c-hint' });
  for (const n of notices ? noticeIndicators(notices, running) : []) {
    parts.push({ text: n.text, cls: n.key === 'update' ? 'wc-c-yellow' : 'wc-c-err', title: n.title });
  }
  return parts;
}

export function EscMain(p: EscMainProps): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const { cols, rows } = useGrid();
  const st = useStatus(p.status);
  const settings = useSettings();
  const { profiles, onProfileSaved, version } = useServices();
  const notices = useNotices();
  const connected = isLive(st);
  const runOn = useRunOn(p.runs);

  const items: MenuItem[] = [
    ...(connected ? [{ key: 'continue', label: 'Continue', activate: p.close }] : []),
    { key: 'reconnect', label: 'Reconnect', activate: p.reconnect },
    ...(runOn && p.runs
      ? [
          {
            key: 'stats',
            label: 'Statistics',
            activate: () => nav.push(<LiveStatsFrame runs={p.runs!} status={p.status} />),
          },
        ]
      : []),
    {
      key: 'profile',
      label: 'Profile',
      activate: () =>
        void editProfile(nav, profiles, settings.profile, {
          isLive: () => isLive(p.status.get()),
          apply: p.liveApply,
          beforeLoad: p.flushWriteBack,
          onSaved: onProfileSaved,
        }),
    },
    { key: 'options', label: 'Options', activate: () => nav.push(<OptionsHub />) },
    { key: 'exit', label: 'Exit session', activate: () => nav.push(<ExitConfirm exit={p.exit} runs={p.runs} />) },
  ];
  const [cursor, setCursor] = useMenuCursor(items, p.preselect);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));

  const parts = headerParts(settings.profile, st, notices, version);
  const sep = '  ·  ';
  const headerW = cellLen(parts.map((x) => x.text).join(sep));
  // header, blank, menu, flash, footer.
  const reserved = 2 + items.length + 1 + 1;
  const showBanner = bannerFits(rows, reserved);
  const used = 1 + (showBanner ? BANNER_H + 2 : 1) + items.length + 1;

  return (
    <div class="wc-page wc-esc-main">
      <div class="wc-line wc-esc-header" style={indent(centreLeft(cols, headerW))}>
        {parts.map((x, i) => (
          <>
            {i > 0 && <span class="wc-c-hint">{sep}</span>}
            <span class={x.cls} title={x.title}>
              {x.text}
            </span>
          </>
        ))}
      </div>
      {showBanner ? (
        <>
          <Blank />
          <Banner hz={6} run={isTop} />
          <Blank />
        </>
      ) : (
        <Blank />
      )}
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      <FlashRow />
      <Blank n={Math.max(0, rows - used - 1)} />
      <Footer tokens={['↑↓ Navigate', 'Enter Select', 'ESC Close']} />
    </div>
  );
}

/**
 * True while `runs` has a run in progress. Re-read after every run event
 * (a tick later, so the end of a run is seen after the deriver's reset)
 * and on every render (status changes re-render the menu).
 */
function useRunOn(runs: LiveRuns | undefined): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!runs) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = runs.subscribe(() => {
      if (t === null) t = setTimeout(() => ((t = null), bump((n) => n + 1)), 0);
    });
    return () => {
      off();
      if (t !== null) clearTimeout(t);
    };
  }, [runs]);
  return runs?.current() != null;
}

/**
 * Exit session (Inv §4.6): `Rate & save this run (optional)` and a star
 * row when there is a run to rate (the recording run, or the latest run
 * of this tab), prefilled with the chain's saved rating. 0–5 / ←→ / click
 * rate; Y saves (`saveChain`: > 0 saves the chain, 0 keeps an existing
 * save) and exits; ESC cancels.
 */
export function ExitConfirm(p: { exit: () => void; runs?: LiveRuns }): VNode {
  const nav = useNav();
  const { cols } = useGrid();
  const rateable = !!p.runs && p.runs.anchor() !== null;
  const [rating, setRating] = useState(0);
  const touched = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!rateable) return;
    let alive = true;
    void p.runs!.chain().then(
      (s) => {
        if (alive && !touched.current && s?.saved) setRating(s.rating);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  const set = (n: number): void => {
    touched.current = true;
    setRating(n);
  };
  const exit = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    if (rateable) {
      try {
        await p.runs!.saveChain(rating);
      } catch {
        /* exiting matters more than the save */
      }
    }
    p.exit();
  };
  useKeys((e) => {
    if ((e.key === 'y' || e.key === 'Y') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      void exit();
      return true;
    }
    const r = rateable ? ratingKey(e, rating) : null;
    if (r !== null) {
      set(r);
      return true;
    }
    return false;
  });
  const footer = [
    ...(rateable ? ['0-5 Rate', '←→ Adjust'] : []),
    { text: 'Y Exit', onClick: () => void exit() },
    { text: 'ESC Cancel', onClick: () => nav.pop() },
  ];
  return (
    <Page title="Exit session" footer={footer}>
      {rateable && (
        <>
          <Blank />
          <Centered text="Rate & save this run (optional)" class="wc-c-hint" />
          <Stars value={rating} at={centreLeft(cols, STARS_W)} onSet={set} />
        </>
      )}
      <Blank />
      <Centered text="Attention! This terminates the current session." class="wc-c-err" />
    </Page>
  );
}
