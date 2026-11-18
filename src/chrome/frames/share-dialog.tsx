// The share dialog (stage 64 C1, spec §7.7, ADR 0154; round 12's pick 2a:
// the rules inside the dialog the first time). An overlay frame over the
// export editor, in the account pages' lazy chunk (account/index.tsx
// exports it; the editor loads that chunk when Export is pressed with Link
// chosen: a chunk of its own would share modules with it and the start
// page and split the app's chunks anew, growing the entry chunk):
//
//   ┌──────── Share as a link ────────┐     ┌──────── Link created ─────────┐
//   │ TITLE  [Rasta · 26 September…]  │     │      Clearing the ranger camp │
//   │ From the character and date; …  │     │ THE LINK                      │
//   │ DESCRIPTION [               ]   │     │ [https://…/r/Ab3dE5fG7hJk] [Copy]
//   │                       0 / 500   │     │                       Copied. │
//   │ ▣ 1.2 MB of 5 MB ▬▬▬───────     │     │ Anyone with the link can …    │
//   │ ⛓ Anyone with the link can …    │     │                        [Done] │
//   │ ┌ THE RULES, ONCE FOR YOUR … ┐  │     └───────────────────────────────┘
//   │ │ • … five lines             │  │
//   │ │ ☐ I have read this and agree│  │
//   │ └────────────────────────────┘  │
//   │ (the error line)                │
//   │            [Cancel] [Create link]│
//   └─────────────────────────────────┘
//
// When it opens it builds the payload (the editor's `build`: exactly as the
// HTML export, validated, gzip, in the editor's chunk) and asks the server for the account
// (`loadAccount`: the rules' tick, the state, the limits), both at once.
// The size line knows the bytes before Create link, so a payload over the
// limit is refused here (the button off) and never sent. The rules' well is
// shown until the account has ticked them; Create link waits for the tick,
// sends it first (`setPrefs({ rulesAccepted: true })`), then the payload.
// While it goes up: stage 24's bar with the bytes sent, the fields locked,
// Cancel aborts. The answer: the link with Copy, or the refusal on the
// error line (too large with the numbers, 150 reached with Open Account,
// offline with Try again).
//
// What leaves the device: the tick, and the POST's body (the meta and the
// payload's gzip bytes, src/cloud/pub/api.ts). Nothing of the doc, the
// run bodies or the keys. The doc keeps no link (a published run is a copy
// of its own).
//
// Keys: the account pages' form ring (`useFormKeys`): Tab walks the title,
// the description, the tick and the buttons; Enter creates the link (or
// presses the cursor's button); Esc cancels.
//
// The listed form (stage 65 C3, ADR 0155, round 13's pick 4: Hall of Fame,
// the export editor's fourth format): the same dialog with `listed`. Its
// title "Publish to the Hall of Fame", the line "Everyone can find this in
// the Community." and its note, Publish (U); the POST's meta says
// `listed: true`. The answer "Published" with the link and Copy, Open
// Community (M: the stack pops to the start menu, which opens its
// Community row, start-request.ts; only where the editor stands on the
// start page) and Done. The 10-a-day refusal (`429 too_many`) is said on
// the error line, with Link now and listing later, and Publish stays off.

import './share.css';
import { touchInteraction } from '../../core/device';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_ACCOUNT_LIMITS, PUB_DESCRIPTION_MAX } from '../../../shared/cloud/api.ts';
import { type Account, loadAccount, setPrefs } from '../../cloud/account';
import { type PubFailure, createPubApi } from '../../cloud/pub/api';
import type { MyPub } from '../../../shared/cloud/api.ts';
import { PREVIEW_MAX_BYTES } from '../../../shared/cloud/preview.ts';
import { cleanTitle, codePointCount, linkMeta, linkUrl, newLinkKey, sizeWords, typedDescription, typedTitle } from '../../share/link';
import type { LinkPayload } from '../../share/link-payload';
import { copyText } from '../kit/clipboard';
import { Check, Dialog, Field, GlassButton, Icon, LoadBar, TextArea, lookFrame, useLookPlace } from '../kit/look';
import { useNav } from '../kit/stack';
import { requestStartRow } from './start-request';
import { useFormKeys } from './account/form';
import {
  ANYONE,
  COPIED,
  COPY_FAILED,
  DESC_PLACEHOLDER,
  DONE_NOTE,
  HOF_DONE_NOTE,
  HOF_DONE_TITLE,
  HOF_EVERYONE,
  HOF_NOTE,
  HOF_TITLE,
  LOGGED_OUT,
  NOT_BUILT,
  RULES,
  RULES_HEAD,
  RULES_TICK,
  SUSPENDED,
  TITLE_HINT,
  createFailureWords,
  tooLargeWords,
  uploadingWords,
} from './share-words';

export interface ShareDialogProps {
  /** The title proposed: the doc's own, or the character and date. */
  title: string;
  /** The doc has no title of its own (the hint says where the proposal comes from). */
  titleIsDefault?: boolean;
  /**
   * Builds the payload (the editor's data, exactly as for HTML), validated
   * and gzip; past `maxBytes` with Desert's tiles, with the default ones
   * (src/share/link-seal.ts).
   */
  build(maxBytes: number): Promise<LinkPayload>;
  /** Hall of Fame (stage 65): the listed form; the run goes to the Community. */
  listed?: boolean;
}

type Built = { ok: true; link: LinkPayload } | { ok: false };
/** The account as far as the dialog needs it; `null` while asked; `false` when it could not be asked. */
type AcctView = Pick<Account, 'state' | 'limits'> & { rulesAccepted: boolean };

type Phase = 'form' | 'up' | 'done';

/** Draws the link's preview image and uploads it; never rejects. */
async function uploadPreview(id: string, link: LinkPayload): Promise<void> {
  try {
    const { renderPreview } = await import('../../share/preview-image');
    const png = await renderPreview(link.payload);
    if (png.length <= PREVIEW_MAX_BYTES) await createPubApi().preview(id, png);
  } catch {
    // No preview: the generic one is shown.
  }
}

export const ShareDialog = lookFrame(function ShareDialog(p: ShareDialogProps): VNode {
  const nav = useNav();
  const listed = p.listed === true;
  const onStart = useLookPlace() === 'start';
  // The listed form keeps its texts by the free public text rules (review fix S3).
  const [title, setTitle] = useState(() => typedTitle(p.title, listed));
  const [desc, setDesc] = useState('');
  const [tick, setTick] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [acct, setAcct] = useState<AcctView | false | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [sent, setSent] = useState<[number, number]>([0, 0]);
  const [failure, setFailure] = useState<PubFailure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<MyPub | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const alive = useRef(true);
  // One idempotency key for the dialog (review fix CR3): Try again after a lost answer gets the same run.
  const key = useRef(newLinkKey());
  const abort = useRef<AbortController | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  const linkRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // The account's limit is not known yet: the default one decides the tiles.
    void p.build(DEFAULT_ACCOUNT_LIMITS.payloadMaxBytes).then(
      (link) => alive.current && setBuilt({ ok: true, link }),
      () => alive.current && setBuilt({ ok: false }),
    );
    void loadAccount().then((r) => {
      if (!alive.current) return;
      if (r.ok) setAcct({ state: r.value.state, limits: r.value.limits, rulesAccepted: r.value.prefs.rulesAccepted });
      else {
        setAcct(false);
        if (r.code === 'unauthorized' || r.code === 'not_logged_in' || r.code === 'wrong_account') setError(LOGGED_OUT);
      }
    });
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);

  const limits = acct ? acct.limits : DEFAULT_ACCOUNT_LIMITS;
  const maxBytes = failure?.code === 'payload_too_large' && failure.limit ? failure.limit : limits.payloadMaxBytes;
  const bytes = built?.ok ? built.link.bytes.length : null;
  const tooLarge = bytes !== null && bytes > maxBytes;
  /** The rules' well: until the account is known to have ticked them (a failed question shows it: a second tick is harmless). */
  const rulesShown = acct === null ? false : acct === false || !acct.rulesAccepted;
  const suspended = acct !== null && acct !== false && acct.state === 'suspended';
  const up = phase === 'up';
  const quota = failure?.code === 'pub_quota';
  /** The day's listings are used up (stage 65): Publish stays off, the line says Link now. */
  const dayFull = failure?.code === 'too_many';
  const loggedOut = error === LOGGED_OUT;
  const canCreate =
    phase === 'form' && built?.ok === true && acct !== null && !tooLarge && !suspended && !quota && !dayFull && !loggedOut && cleanTitle(title, listed) !== '' && (!rulesShown || tick);

  const close = (): void => {
    abort.current?.abort();
    nav.pop();
  };

  const create = async (): Promise<void> => {
    if (!canCreate || !built?.ok) return;
    const link = built.link;
    setError(null);
    setFailure(null);
    setPhase('up');
    setSent([0, link.bytes.length]);
    const ctl = new AbortController();
    abort.current = ctl;
    // The tick first (once per account): the server refuses a link until it has it.
    if (rulesShown) {
      const r = await setPrefs({ rulesAccepted: true });
      if (!alive.current || ctl.signal.aborted) return;
      if (!r.ok) {
        setPhase('form');
        setError(r.code === 'offline' ? createFailureWords('offline') : r.code === 'unauthorized' || r.code === 'not_logged_in' ? LOGGED_OUT : createFailureWords('bad_answer'));
        return;
      }
      setAcct((a) => (a ? { ...a, rulesAccepted: true } : { state: 'active', limits, rulesAccepted: true }));
    }
    const meta = linkMeta({ title, description: desc, character: link.payload.character, level: link.payload.level, lengthS: link.lengthS, key: key.current, listed });
    const r = await createPubApi().create(meta, link.bytes, { signal: ctl.signal, onProgress: (s, t) => alive.current && setSent([s, t]) });
    if (!alive.current || (!r.ok && r.code === 'cancelled')) return;
    if (r.ok) {
      setMade(r.value);
      setPhase('done');
      // The link preview image (ADR 0158), in the background: the link
      // works without it (the generic image stands in), so a failure is quiet.
      void uploadPreview(r.value.id, link);
      return;
    }
    setPhase('form');
    setFailure(r);
    if (r.code === 'rules') setAcct((a) => (a ? { ...a, rulesAccepted: false } : a));
    if (r.code === 'suspended') setAcct((a) => (a ? { ...a, state: 'suspended' } : a));
    // The device learns that its session is gone (the flows log it out).
    if (r.code === 'unauthorized') void loadAccount();
    setError(createFailureWords(r.code, r.code === 'too_many' ? (acct ? acct.limits.listingsPerDay : DEFAULT_ACCOUNT_LIMITS.listingsPerDay) : r.limit));
  };

  /** The Community page: the stack goes back to the start menu, which opens its Community row (start-request.ts). */
  const openCommunity = (): void => {
    requestStartRow('community');
    nav.pop(Math.max(1, nav.depth() - 1));
  };

  const openAccount = (): void => {
    nav.pop();
    void import('./account').then((m) => nav.push(m.accountEntry(true)));
  };

  const url = made ? linkUrl(made.id) : '';
  const copy = (): void => {
    void copyText(url).then((ok) => {
      if (!alive.current) return;
      setCopied(ok ? COPIED : COPY_FAILED);
      if (!ok) linkRef.current?.select();
    });
  };

  const done = phase === 'done';
  const keys = useFormKeys({
    layer: true,
    stops: done
      ? [
          { id: 'COPY', run: copy },
          ...(listed && onStart ? [{ id: 'COMMUNITY', run: openCommunity }] : []),
          { id: 'DONE', run: close },
        ]
      : [
          { id: 'title', field: titleRef },
          { id: 'desc', field: descRef as unknown as { current: HTMLInputElement | null } },
          ...(rulesShown ? [{ id: 'TICK', run: () => setTick((t) => !t), disabled: up }] : []),
          { id: 'CANCEL', run: close },
          ...(quota ? [{ id: 'ACCOUNT', run: openAccount }] : []),
          { id: listed ? 'PUBLISH' : 'CREATE', run: () => void create(), disabled: !canCreate },
        ],
    submit: done ? close : () => void create(),
    canSubmit: done || canCreate,
    back: close,
  });

  if (done && made) {
    return (
      <Dialog
        title={listed ? HOF_DONE_TITLE : 'Link created'}
        dlg="share-done"
        width={540}
        at={keys.at}
        onCancel={close}
        buttons={[
          ...(listed && onStart ? [{ id: 'COMMUNITY', label: 'Open Community', letter: 'm', run: openCommunity }] : []),
          { id: 'DONE', label: 'Done', letter: 'd', primary: true, run: close },
        ]}
      >
        <div class="wc-sh">
          <p class="wc-lk-q wc-sh-made" data-pub-title="">
            {made.title}
          </p>
          <div class="wc-sh-linkrow">
            <Field id="link" label="The link" value={url} onInput={() => {}} mono readOnly inputRef={linkRef} />
            <GlassButton id="COPY" label="Copy" letter="c" icon="duplicate" primary selected={keys.at === 'COPY'} onClick={copy} />
          </div>
          <p class="wc-sh-copied" role="status">
            {copied ?? ''}
          </p>
          <p class="wc-lk-qn wc-sh-note">{listed ? HOF_DONE_NOTE : DONE_NOTE}</p>
        </div>
      </Dialog>
    );
  }

  const n = codePointCount(desc);
  const sizeLine =
    bytes === null ? (
      <span class="wc-sh-measure">{built === null ? 'Building the replay…' : NOT_BUILT}</span>
    ) : (
      <>
        <span>
          <b>{sizeWords(bytes)}</b> of {sizeWords(maxBytes)}
        </span>
        {!tooLarge && (
          <span class="wc-sh-sizebar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(1, (bytes / maxBytes) * 100))}%` }} />
          </span>
        )}
      </>
    );
  const shownError = error ?? (tooLarge ? tooLargeWords(maxBytes) : suspended ? SUSPENDED : built?.ok === false ? NOT_BUILT : null);
  const retry = failure?.code === 'offline' || failure?.code === 'timeout';
  return (
    <Dialog
      title={listed ? HOF_TITLE : 'Share as a link'}
      dlg="share"
      width={540}
      error={shownError}
      at={keys.at}
      onCancel={close}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'c', run: close },
        ...(quota ? [{ id: 'ACCOUNT', label: 'Open Account', letter: 'a', run: openAccount }] : []),
        listed
          ? { id: 'PUBLISH', label: up ? 'Publishing…' : retry ? 'Try again' : 'Publish', letter: 'u', primary: true, disabled: !canCreate, run: () => void create() }
          : { id: 'CREATE', label: up ? 'Creating…' : retry ? 'Try again' : 'Create link', letter: 'l', primary: true, disabled: !canCreate, run: () => void create() },
      ]}
    >
      <div class={'wc-sh' + (up ? ' is-locked' : '')}>
        <form class="wc-ac-dform" noValidate {...keys.form}>
          <Field
            id="title"
            label="Title"
            value={title}
            disabled={up}
            // (Not on a touch screen: the keyboard would cover the form and its buttons.)
            autoFocus={!touchInteraction()}
            inputRef={titleRef}
            hint={p.titleIsDefault && title === p.title ? TITLE_HINT : undefined}
            onInput={(v) => setTitle(typedTitle(v, listed))}
          />
          <TextArea
            id="desc"
            label="Description"
            value={desc}
            rows={3}
            disabled={up}
            enterSubmits
            placeholder={DESC_PLACEHOLDER}
            inputRef={descRef}
            hint={<span class={'wc-sh-count' + (n >= PUB_DESCRIPTION_MAX ? ' is-full' : '')}>{`${n} / ${PUB_DESCRIPTION_MAX}`}</span>}
            onInput={(v) => setDesc(typedDescription(v, listed))}
          />
        </form>
        <p class={'wc-sh-size' + (tooLarge ? ' is-over' : '')} data-size={bytes ?? undefined}>
          <Icon name="save" />
          {sizeLine}
        </p>
        {listed ? (
          <>
            <p class="wc-sh-anyone is-listed">
              <Icon name="star" />
              <span>{HOF_EVERYONE}</span>
            </p>
            <p class="wc-lk-qn wc-sh-listnote">{HOF_NOTE}</p>
          </>
        ) : (
          <p class="wc-sh-anyone">
            <Icon name="link" />
            <span>{ANYONE}</span>
          </p>
        )}
        {rulesShown && (
          <div class="wc-sh-rules" data-rules="">
            <p class="wc-sh-rules-h">{RULES_HEAD}</p>
            <ul class="wc-sh-rules-l">
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div class={'wc-sh-tick' + (keys.at === 'TICK' ? ' is-cur' : '')}>
              <Check id="rules" label={RULES_TICK} checked={tick} onChange={(on) => !up && setTick(on)} />
            </div>
          </div>
        )}
        {up && <LoadBar class="wc-sh-load" done={sent[0]} total={sent[1]} line={uploadingWords(sent[0], sent[1])} />}
      </div>
    </Dialog>
  );
});
