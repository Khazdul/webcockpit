// Published runs on the Account page (stage 64 C1, spec §7.7, ADR 0154;
// round 12's pick 4a: a section after Sync). Only while the flags
// `accounts` and `share` are on; the page is the logged-in account's.
//
// Two forms by the flag `gallery` (stage 65 C3, ADR 0155, round 13's pick 6):
//
// - `gallery` off (stage 64, unchanged): the whole list as a section.
//
//     PUBLISHED RUNS ─────────────────────────────────────────────
//       Clearing the ranger camp      37 views · 15 Nov 2026 · 1.2 MB · link only
//       /r/Ab3dE5fG7hJk [Copy]                            [Edit] [Remove]
//     4 of 150 · 6.1 MB · links do not count against your 50 MB.
//
// - `gallery` on: the section shrinks to one row, and the list is a view of
//   its own (`PublishedFrame`, a page over the Account page, or opened
//   straight from the start menu's owner row when it marks new reactions).
//
//     PUBLISHED RUNS ─────────────────────────────────────────────
//     4 runs · 2 listed · 475 views · 2 new           [Published runs]
//
//     ┌──────────────── Published runs ────────────────┐
//     │ FENWICK                                         │
//     │ 4 of 150 · 6.1 MB, not counted against … · 2 new since you last looked
//     │▌Clearing the ranger camp                 ☆ LISTED│
//     │▌★★★★☆ 4.3 · 12 votes  ▭ 5  37 views  15 Nov 2026 · 1.2 MB  ● 1 vote · 1 comment new
//     │▌/r/Ab3dE5fG7hJk [Copy]                [Edit] [Remove]
//     └─────────────────────────────────────────────────┘
//
//   Opening the view asks the community's news (src/cloud/community/news.ts)
//   first, then the list, then posts `seen {reactions: newestReaction}`:
//   everything the news counted was in the list fetched after it, so nothing
//   is marked seen that was not shown. The view keeps what was new at
//   opening (gold, a mark at the left) until it is closed, also after an
//   Edit or a Remove fetches the list again. Edit has the switch "Listed in
//   the Community" (`PATCH listed`; the 10-a-day refusal said in the dialog).
//
// `GET /api/u/pub` when the page (or the view) opens and after every change.
// Edit and Remove are overlay dialogs. Copy puts the whole link on the
// clipboard and says so on the page's flash. Every text from the server is
// written as text.
//
// A press on a run's title opens its watch page in this tab (`watchHref`;
// owner's feedback on stage 65, ADR 0155 W1); its Back comes here again.
//
// The keyboard: the section's stops (`usePublished().stops`: the rows'
// `OPEN:<id>` (the title), `COPY:<id>`, `EDIT:<id>`, `REMOVE:<id>`, or the one row's `PUBLISHED`,
// whose letter is U) join the Account page's ring; the view has its own.

import { touchInteraction } from '../../../core/device';
import { h } from 'preact';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_ACCOUNT_LIMITS, type AccountLimits, type MyPub, PUB_DESCRIPTION_MAX } from '../../../../shared/cloud/api.ts';
import { loadAccount } from '../../../cloud/account';
import { communityNews, markCommunitySeen, refreshCommunityNews } from '../../../cloud/community/news';
import { type PubErrorCode, createPubApi, shareEnabled } from '../../../cloud/pub/api';
import { communityAllowed } from '../../../cloud/community/allowed';
import { cleanDescription, cleanTitle, codePointCount, linkPath, linkUrl, sizeWords, typedDescription, typedTitle } from '../../../share/link';
import { watchHref } from '../../../watch/href';
import { copyText } from '../../kit/clipboard';
import { Box, BoxBody, Dialog, Field, GlassButton, Icon, LookFlash, Rule, Stars, TextArea, Toggle, lookFrame } from '../../kit/look';
import { type Nav, useNav } from '../../kit/stack';
import {
  COPY_FAILED,
  EDIT_NOTE,
  LINK_ONLY,
  LISTED,
  LISTED_NOTE,
  LISTED_SWITCH,
  PUB_EMPTY,
  PUB_HIDDEN,
  PUB_NONE,
  REMOVE_NOTE,
  meanWords,
  newWords,
  pubFailureWords,
  pubFigures,
  pubFoot,
  pubNewWords,
  pubSummary,
  pubViewHead,
} from '../share-words';
import type { AccountHost } from './account-page';
import { madeWords } from './account-model';
import { FormError, go, useFormKeys } from './form';
import { failureWords } from './words';

/** What the dialogs and the view need of the page under them: where a gone session goes. */
type Host = () => Pick<AccountHost, 'toLogin'>;

export interface PublishedView {
  /** The section is there (the flags are on). */
  shown: boolean;
  /** The keyboard's stops of the section, in order. */
  stops: { id: string; run(): void }[];
  /** U: opens the view (the one row's button), when there is one. */
  open: (() => void) | null;
  /** Fetches the list again. */
  reload(): void;
  node(at: string | null, limits: AccountLimits | null): VNode | null;
}

const api = createPubApi();

const openRun = (p: MyPub, from: 'account' | 'published'): void => location.assign(watchHref(p.id, from));


/** New reactions on the runs, summed (each run's counts are capped at 99 by the server). */
const newOf = (pubs: MyPub[]): number => pubs.reduce((n, p) => n + (p.news ? p.news.votes + p.news.comments : 0), 0);

/** The section's state and its node; the page puts the node after Sync. */
export function usePublished(nav: Nav, host: () => AccountHost): PublishedView {
  const [shown, setShown] = useState(false);
  /** The flag `gallery`: the one row and the view (stage 65). */
  const [community, setCommunity] = useState(false);
  const [pubs, setPubs] = useState<MyPub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);
  const alive = useRef(true);
  const limitsRef = useRef<AccountLimits | null>(null);

  const load = (): void => {
    const n = ++asked.current;
    void api.list().then((r) => {
      if (!alive.current || n !== asked.current) return;
      if (r.ok) {
        setError(null);
        setPubs(r.value);
        return;
      }
      if (r.code === 'disabled') return setShown(false);
      if (r.code === 'unauthorized') return host().toLogin(failureWords('unauthorized', 'account'));
      setError(pubFailureWords(r.code, 'list'));
    });
  };

  useEffect(() => {
    void Promise.all([shareEnabled(), communityAllowed('read')]).then(([on, g]) => {
      if (!alive.current) return;
      setCommunity(g);
      setShown(on);
      if (on) load();
    });
    return () => {
      alive.current = false;
    };
  }, []);

  const copy = (p: MyPub): void => {
    void copyText(linkUrl(p.id)).then((ok) => nav.flash(ok ? 'Copied the link.' : COPY_FAILED, ok ? undefined : 'fail'));
  };
  const edit = (p: MyPub): void => nav.push(h(EditPubDialog, { host, pub: p, done: load, community: false }) as VNode, { overlay: true });
  const remove = (p: MyPub): void => nav.push(h(RemovePubDialog, { host, pub: p, done: load }) as VNode, { overlay: true });
  // The view over the page; the page's row asks again when it closes (what was new is seen now).
  const openView = (): void => nav.push(h(PublishedFrame, { host, limits: limitsRef.current, closed: load }) as VNode);

  const one = community && !error && pubs !== null && pubs.length > 0;
  const stops = !shown
    ? []
    : [
        ...(error ? [{ id: 'PUBRETRY', run: load }] : []),
        ...(community
          ? one
            ? [{ id: 'PUBLISHED', run: openView }]
            : []
          : (pubs ?? []).flatMap((p) => [
              { id: `OPEN:${p.id}`, run: () => openRun(p, 'account') },
              { id: `COPY:${p.id}`, run: () => copy(p) },
              // A hidden run cannot be edited until the admin has looked (the Worker's 403 hidden).
              ...(p.state === 'hidden' ? [] : [{ id: `EDIT:${p.id}`, run: () => edit(p) }]),
              { id: `REMOVE:${p.id}`, run: () => remove(p) },
            ])),
      ];

  const node = (at: string | null, limits: AccountLimits | null): VNode | null => {
    if (!shown) return null;
    limitsRef.current = limits;
    const lim = limits ?? DEFAULT_ACCOUNT_LIMITS;
    const total = (pubs ?? []).reduce((n, p) => n + p.bytes, 0);
    const fresh = pubs ? newOf(pubs) : 0;
    return (
      <>
        <Rule title="Published logs" id="published" />
        <div class={'wc-ac-pubs' + (community ? ' is-row' : '')} data-pubs={pubs === null ? 'asking' : pubs.length}>
          {error ? (
            <div class="wc-ac-noload">
              <FormError text={error} id="published" />
              <GlassButton id="PUBRETRY" label="Try again" small selected={at === 'PUBRETRY'} onClick={load} />
            </div>
          ) : pubs === null ? (
            <p class="wc-ac-devs-wait">Asking the server…</p>
          ) : community ? (
            pubs.length === 0 ? (
              <p class="wc-ac-pubrow wc-ac-pub-empty" data-pub-empty="">
                <span class="wc-ac-pubrow-w">
                  <b>{PUB_NONE.slice(0, PUB_NONE.indexOf('yet.') + 4)}</b>
                  {PUB_NONE.slice(PUB_NONE.indexOf('yet.') + 4)}
                </span>
              </p>
            ) : (
              <div class="wc-ac-pubrow" data-pub-row="">
                <span class="wc-ac-pubrow-w" data-pub-summary="">
                  {pubSummary({ runs: pubs.length, listed: pubs.filter((p) => p.listed).length, views: pubs.reduce((n, p) => n + p.views, 0) })}
                  {fresh > 0 && (
                    <>
                      {' · '}
                      <span class="wc-ac-pub-gold" data-pub-new="">
                        {newWords(fresh)}
                      </span>
                    </>
                  )}
                </span>
                <GlassButton id="PUBLISHED" label="Published logs" letter="u" icon="link" small selected={at === 'PUBLISHED'} onClick={openView} />
              </div>
            )
          ) : pubs.length === 0 ? (
            <p class="wc-ac-small wc-ac-pub-empty" data-pub-empty="">
              {PUB_EMPTY.slice(0, PUB_EMPTY.lastIndexOf('Link'))}
              <b>Link</b>
              {PUB_EMPTY.slice(PUB_EMPTY.lastIndexOf('Link') + 4)}
            </p>
          ) : (
            <>
              <PubList pubs={pubs} at={at} community={false} onCopy={copy} onEdit={edit} onRemove={remove} />
              <p class="wc-ac-small wc-ac-pub-foot">
                {pubFoot({ count: pubs.length, limit: lim.sharedRuns, size: sizeWords(total), runBytes: sizeWords(lim.runBytes) })}
              </p>
            </>
          )}
        </div>
      </>
    );
  };

  return { shown, stops, open: one ? openView : null, reload: load, node };
}

/** The rows: stage 64's two lines, with the community's figures and what is new between them (`community`). */
function PubList(p: {
  pubs: MyPub[];
  at: string | null;
  community: boolean;
  /** What was new on each run when the view opened (by id). */
  fresh?: Map<string, { votes: number; comments: number }>;
  onCopy(p: MyPub): void;
  onEdit(p: MyPub): void;
  onRemove(p: MyPub): void;
}): VNode {
  const at = p.at;
  return (
    <ul class={'wc-lk-rows is-flat wc-ac-publist' + (p.community ? ' is-view' : '')} aria-label="Published logs">
      {p.pubs.map((pub) => {
        const hidden = pub.state === 'hidden';
        const news = p.fresh?.get(pub.id);
        const fresh = pubNewWords(news);
        const mean = meanWords(pub.stars);
        return (
          <li
            key={pub.id}
            class={'wc-lk-row wc-ac-pub' + (hidden ? ' is-hidden' : '') + (fresh ? ' is-new' : '')}
            data-pub={pub.id}
            data-state={pub.state}
            data-listed={p.community ? String(pub.listed) : undefined}
          >
            <div class="wc-ac-pub-l1">
              <a
                class={'wc-ac-pub-t wc-ac-pub-open' + (at === `OPEN:${pub.id}` ? ' is-sel' : '')}
                data-pub-title=""
                href={watchHref(pub.id, p.community ? 'published' : 'account')}
                title="Watch this log"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
              >
                {pub.title}
              </a>
              {p.community ? (
                <span class={'wc-ac-pub-chip' + (pub.listed ? ' is-listed' : '')} data-pub-chip="">
                  <Icon name={pub.listed ? 'star' : 'link'} />
                  {pub.listed ? LISTED : LINK_ONLY}
                </span>
              ) : (
                <span class="wc-ac-pub-fig">{pubFigures({ views: pub.views, date: madeWords(pub.created), size: sizeWords(pub.bytes) })}</span>
              )}
            </div>
            {p.community && (
              <div class="wc-ac-pub-r" data-pub-figures="">
                {mean ? (
                  <span class="wc-ac-pub-stars" data-pub-stars="">
                    <Stars n={Number(mean)} />
                    <b>{mean}</b> · {pub.stars!.count} {pub.stars!.count === 1 ? 'vote' : 'votes'}
                  </span>
                ) : (
                  <span class="wc-ac-pub-faint" data-pub-stars="">
                    no votes
                  </span>
                )}
                <span class="wc-ac-pub-n" data-pub-comments="" title="Comments">
                  <Icon name="comment" />
                  {pub.comments ?? 0}
                </span>
                <span class="wc-ac-pub-n" data-pub-views="">
                  {pub.views} {pub.views === 1 ? 'view' : 'views'}
                </span>
                <span class="wc-ac-pub-dt">
                  {madeWords(pub.created)} · {sizeWords(pub.bytes)}
                </span>
                {fresh && (
                  <span class="wc-ac-pub-new" data-pub-new="">
                    {fresh}
                  </span>
                )}
              </div>
            )}
            {hidden && (
              <div class="wc-ac-pub-hid" data-pub-hidden="">
                <Icon name="flag" />
                <span>{PUB_HIDDEN}</span>
              </div>
            )}
            <div class="wc-ac-pub-l2">
              <span class="wc-ac-pub-url" title={linkUrl(pub.id)}>
                {linkPath(pub.id)}
              </span>
              <GlassButton id="COPY" label="Copy" icon="duplicate" small selected={at === `COPY:${pub.id}`} onClick={() => p.onCopy(pub)} />
              <span class="wc-ac-pub-sp" />
              {!hidden && <GlassButton id="EDIT" label="Edit" icon="pencil" small selected={at === `EDIT:${pub.id}`} onClick={() => p.onEdit(pub)} />}
              <GlassButton id="REMOVE" label="Remove" icon="trash" small danger selected={at === `REMOVE:${pub.id}`} onClick={() => p.onRemove(pub)} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------ the view (stage 65)

export interface PublishedFrameProps {
  /** The Account page under the view (its `toLogin`); absent when opened from the start menu's owner row. */
  host?: () => AccountHost;
  /** The account's limits when the page knows them (else asked here). */
  limits?: AccountLimits | null;
  /** Called when the view closes (the page asks for its row again). */
  closed?: () => void;
}

/**
 * Published runs as a view of its own (round 13's pick 6). A page over the
 * Account page, or the owner row's page when it marks new reactions; Back
 * and Esc return to where it was opened from.
 */
export const PublishedFrame = lookFrame(function PublishedFrame(props: PublishedFrameProps): VNode {
  const nav = useNav();
  const [pubs, setPubs] = useState<MyPub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<AccountLimits | null>(props.limits ?? null);
  const [name, setName] = useState<string>(() => props.host?.().name ?? '');
  /** What was new on each run when the view opened: shown until it closes. */
  const [fresh, setFresh] = useState<Map<string, { votes: number; comments: number }> | null>(null);
  const alive = useRef(true);
  const left = useRef(false);
  const asked = useRef(0);

  const toLogin = (notice: string): void => {
    if (!alive.current || left.current) return;
    left.current = true;
    const h0 = props.host;
    if (h0) h0().toLogin(notice);
    else go(nav, 'login', { notice });
  };
  const host: Host = () => ({ toLogin });

  /** One list request; `first` keeps what was new (and marks it seen). */
  const load = async (first = false): Promise<void> => {
    const n = ++asked.current;
    const r = await api.list();
    if (!alive.current || n !== asked.current) return;
    if (!r.ok) {
      if (r.code === 'unauthorized') return toLogin(failureWords('unauthorized', 'account'));
      setError(pubFailureWords(r.code, 'list'));
      return;
    }
    setError(null);
    setPubs(r.value);
    if (first) setFresh(new Map(r.value.filter((p) => p.news && p.news.votes + p.news.comments > 0).map((p) => [p.id, p.news!])));
  };

  useEffect(() => {
    void (async () => {
      // The news first: everything it counts is in the list asked after it, so `seen` marks only what is shown.
      const news = await refreshCommunityNews();
      if (!alive.current) return;
      await load(true);
      if (!alive.current) return;
      const newest = (news ?? communityNews())?.newestReaction ?? null;
      if (newest !== null) void markCommunitySeen({ reactions: newest });
    })();
    if (!props.limits || !props.host) {
      void loadAccount().then((r) => {
        if (!alive.current || !r.ok) return;
        setLimits(r.value.limits);
        setName(r.value.name);
      });
    }
    return () => {
      alive.current = false;
      props.closed?.();
    };
  }, []);

  const reload = (): void => void load();
  const copy = (p: MyPub): void => {
    void copyText(linkUrl(p.id)).then((ok) => nav.flash(ok ? 'Copied the link.' : COPY_FAILED, ok ? undefined : 'fail'));
  };
  const edit = (p: MyPub): void => nav.push(h(EditPubDialog, { host, pub: p, done: reload, community: true }) as VNode, { overlay: true });
  const remove = (p: MyPub): void => nav.push(h(RemovePubDialog, { host, pub: p, done: reload }) as VNode, { overlay: true });
  const back = (): void => nav.pop();

  const keys = useFormKeys({
    stops: [
      ...(error ? [{ id: 'PUBRETRY', run: reload }] : []),
      ...(pubs ?? []).flatMap((p) => [
        { id: `OPEN:${p.id}`, run: () => openRun(p, 'published') },
        { id: `COPY:${p.id}`, run: () => copy(p) },
        ...(p.state === 'hidden' ? [] : [{ id: `EDIT:${p.id}`, run: () => edit(p) }]),
        { id: `REMOVE:${p.id}`, run: () => remove(p) },
      ]),
    ],
    submit: () => {},
    canSubmit: false,
    back,
  });
  const at = keys.at;
  const formRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (at) formRef.current?.querySelector('.wc-ac-pub .is-sel')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const lim = limits ?? DEFAULT_ACCOUNT_LIMITS;
  const total = (pubs ?? []).reduce((n, p) => n + p.bytes, 0);
  const freshAll = fresh ? [...fresh.values()].reduce((n, v) => n + v.votes + v.comments, 0) : 0;
  return (
    <Box title="Published logs" onBack={back} tall class="wc-ac wc-ac-account wc-ac-pubview" winClass="wc-ac-win">
      <BoxBody class="wc-ac-body" scroll>
        <div class="wc-ac-form wc-ac-acct" data-page="published" ref={formRef}>
          <div class="wc-ac-head">
            <span class="wc-ac-head-name" data-account-name="">
              {name}
            </span>
            <span class="wc-ac-head-since" data-pub-head="">
              {pubs === null ? (
                error ? (
                  ''
                ) : (
                  'Asking the server…'
                )
              ) : (
                <>
                  {pubViewHead({ count: pubs.length, limit: lim.sharedRuns, size: sizeWords(total), runBytes: sizeWords(lim.runBytes) })}
                  {freshAll > 0 && (
                    <>
                      {' · '}
                      <span class="wc-ac-pub-gold" data-pub-new="">
                        {newWords(freshAll)} since you last looked
                      </span>
                    </>
                  )}
                </>
              )}
            </span>
          </div>
          <div class="wc-ac-pubs is-view" data-pubs={pubs === null ? 'asking' : pubs.length}>
            {error ? (
              <div class="wc-ac-noload">
                <FormError text={error} id="published" />
                <GlassButton id="PUBRETRY" label="Try again" small selected={at === 'PUBRETRY'} onClick={reload} />
              </div>
            ) : pubs === null ? null : pubs.length === 0 ? (
              <p class="wc-ac-small wc-ac-pub-empty" data-pub-empty="">
                <b>{PUB_NONE.slice(0, PUB_NONE.indexOf('yet.') + 4)}</b>
                {PUB_NONE.slice(PUB_NONE.indexOf('yet.') + 4)}
              </p>
            ) : (
              <PubList pubs={pubs} at={at} community fresh={fresh ?? undefined} onCopy={copy} onEdit={edit} onRemove={remove} />
            )}
          </div>
          <LookFlash class="wc-ac-flash" />
        </div>
      </BoxBody>
    </Box>
  );
});

/** A failure the dialogs need no words for: the session is gone (the page leaves for Log in). */
function gone(host: Pick<AccountHost, 'toLogin'>, code: PubErrorCode): boolean {
  if (code !== 'unauthorized') return false;
  host.toLogin(failureWords('unauthorized', 'account'));
  return true;
}

/** The link without its scheme, for the Edit dialog's note ("mumecockpit.com/r/…"). */
const bareLink = (id: string): string => linkUrl(id).replace(/^https?:\/\//, '');

// ------------------------------------------------------------ Edit

export const EditPubDialog = lookFrame(function EditPubDialog(p: { host: Host; pub: MyPub; done(): void; community?: boolean }): VNode {
  const nav = useNav();
  const [title, setTitle] = useState(p.pub.title);
  const [desc, setDesc] = useState(p.pub.description.replace(/\s+/g, ' '));
  /** "Listed in the Community" (stage 65: only in the view, with the flag `gallery`). */
  const [listed, setListed] = useState(p.pub.listed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const titleRef = useRef<HTMLInputElement | null>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  // A run listed after the save keeps its texts by the free public text rules (review fix S3).
  const strict = p.community === true ? listed : p.pub.listed;
  const t = cleanTitle(title, strict);
  const d = cleanDescription(desc, strict);
  const changed = t !== p.pub.title || d !== p.pub.description || (p.community === true && listed !== p.pub.listed);
  const canSave = !busy && t !== '' && changed;
  const cancel = (): void => {
    if (!busy) nav.pop();
  };
  const save = async (): Promise<void> => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const host = p.host();
    const r = await createPubApi().edit(p.pub.id, {
      ...(t !== p.pub.title ? { title: t } : {}),
      ...(d !== p.pub.description ? { description: d } : {}),
      ...(p.community && listed !== p.pub.listed ? { listed } : {}),
    });
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      nav.pop();
      nav.flash('Saved.');
      p.done();
      return;
    }
    if (gone(host, r.code)) return;
    if (r.code === 'not_found') p.done();
    setError(pubFailureWords(r.code, 'edit'));
  };
  const keys = useFormKeys({
    layer: true,
    stops: [
      { id: 'title', field: titleRef },
      { id: 'desc', field: descRef as unknown as { current: HTMLInputElement | null } },
      ...(p.community ? [{ id: 'LISTED', run: () => !busy && setListed((v) => !v), disabled: busy }] : []),
      { id: 'CANCEL', run: cancel },
      { id: 'SAVE', run: () => void save(), disabled: !canSave },
    ],
    submit: () => void save(),
    canSubmit: canSave,
    back: cancel,
  });
  const n = codePointCount(desc);
  return (
    <Dialog
      title="Edit"
      dlg="pub-edit"
      width={520}
      error={error}
      at={keys.at}
      onCancel={cancel}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', run: cancel, disabled: busy },
        { id: 'SAVE', label: busy ? 'Saving…' : 'Save', primary: true, disabled: !canSave, run: () => void save() },
      ]}
    >
      <div class="wc-ac-dlg wc-ac-pubdlg">
        <form class="wc-ac-dform" noValidate {...keys.form}>
          <Field id="title" label="Title" value={title} disabled={busy} autoFocus={!touchInteraction()} inputRef={titleRef} onInput={(v) => setTitle(typedTitle(v, strict))} />
          <TextArea
            id="desc"
            label="Description"
            value={desc}
            rows={3}
            disabled={busy}
            enterSubmits
            inputRef={descRef}
            hint={<span class="wc-ac-pub-count">{`${n} / ${PUB_DESCRIPTION_MAX}`}</span>}
            onInput={(v) => setDesc(typedDescription(v, strict))}
          />
        </form>
        {p.community && (
          <div class={'wc-ac-pub-listrow' + (keys.at === 'LISTED' ? ' is-cur' : '')}>
            <Toggle id="listed" label={LISTED_SWITCH} on={listed} onChange={(on) => !busy && setListed(on)} />
          </div>
        )}
        <p class="wc-lk-qn wc-ac-pub-note">
          {p.community ? `${LISTED_NOTE} ` : ''}
          {EDIT_NOTE} <span class="wc-ac-pub-bare">{bareLink(p.pub.id)}</span>
        </p>
      </div>
    </Dialog>
  );
});

// ------------------------------------------------------------ Remove

export const RemovePubDialog = lookFrame(function RemovePubDialog(p: { host: Host; pub: MyPub; done(): void }): VNode {
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const cancel = (): void => {
    if (!busy) nav.pop();
  };
  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const host = p.host();
    const r = await createPubApi().remove(p.pub.id);
    if (!alive.current) return;
    setBusy(false);
    // Gone already is what was asked for.
    if (r.ok || r.code === 'not_found') {
      nav.pop();
      nav.flash('Removed. The link now says so.');
      p.done();
      return;
    }
    if (gone(host, r.code)) return;
    setError(pubFailureWords(r.code, 'remove'));
  };
  return (
    <Dialog
      title="Remove"
      dlg="pub-remove"
      width={480}
      error={error}
      onCancel={cancel}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'c', primary: true, disabled: busy, run: cancel },
        { id: 'REMOVE', label: busy ? 'Removing…' : 'Remove', letter: 'r', danger: true, disabled: busy, run: () => void remove() },
      ]}
    >
      <p class="wc-lk-q">
        Remove “<span class="wc-ac-pub-qt">{p.pub.title}</span>”?
      </p>
      <p class="wc-lk-qn">{REMOVE_NOTE}</p>
    </Dialog>
  );
});
