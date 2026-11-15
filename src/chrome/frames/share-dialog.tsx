// The share dialog (stage 64 C1, spec §7.7, ADR 0154; round 12's pick 2a:
// the rules inside the dialog the first time). An overlay frame over the
// export editor, its own lazy chunk (the editor imports it when Export is
// pressed with Link chosen):
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
// HTML export, validated, gzip) and asks the server for the account
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

import './share.css';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_ACCOUNT_LIMITS, PUB_DESCRIPTION_MAX } from '../../../shared/cloud/api.ts';
import { type Account, loadAccount, setPrefs } from '../../cloud/account';
import { type PubFailure, createPubApi } from '../../cloud/pub/api';
import type { MyPub } from '../../../shared/cloud/api.ts';
import { codePointCount, linkMeta, linkUrl, sizeWords, typedDescription, typedTitle } from '../../share/link';
import type { LinkPayload } from '../../share/link-payload';
import { copyText } from '../kit/clipboard';
import { Check, Dialog, Field, GlassButton, Icon, LoadBar, TextArea, lookFrame } from '../kit/look';
import { useNav } from '../kit/stack';
import { useFormKeys } from './account/form';
import { LINK_ICON } from './share-glyphs';
import {
  ANYONE,
  COPIED,
  COPY_FAILED,
  DESC_PLACEHOLDER,
  DONE_NOTE,
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
  /** Builds the payload (the editor's data, exactly as for HTML). */
  build(): Promise<LinkPayload>;
}

type Built = { ok: true; link: LinkPayload } | { ok: false };
/** The account as far as the dialog needs it; `null` while asked; `false` when it could not be asked. */
type AcctView = Pick<Account, 'state' | 'limits'> & { rulesAccepted: boolean };

type Phase = 'form' | 'up' | 'done';

export const ShareDialog = lookFrame(function ShareDialog(p: ShareDialogProps): VNode {
  const nav = useNav();
  const [title, setTitle] = useState(p.title);
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
  const abort = useRef<AbortController | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  const linkRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void p.build().then(
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
  const loggedOut = error === LOGGED_OUT;
  const canCreate =
    phase === 'form' && built?.ok === true && acct !== null && !tooLarge && !suspended && !quota && !loggedOut && title.trim() !== '' && (!rulesShown || tick);

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
    const meta = linkMeta({ title, description: desc, character: link.payload.character, level: link.payload.level, lengthS: link.lengthS });
    const r = await createPubApi().create(meta, link.bytes, { signal: ctl.signal, onProgress: (s, t) => alive.current && setSent([s, t]) });
    if (!alive.current || (!r.ok && r.code === 'cancelled')) return;
    if (r.ok) {
      setMade(r.value);
      setPhase('done');
      return;
    }
    setPhase('form');
    setFailure(r);
    if (r.code === 'rules') setAcct((a) => (a ? { ...a, rulesAccepted: false } : a));
    if (r.code === 'suspended') setAcct((a) => (a ? { ...a, state: 'suspended' } : a));
    // The device learns that its session is gone (the flows log it out).
    if (r.code === 'unauthorized') void loadAccount();
    setError(createFailureWords(r.code, r.limit));
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
          { id: 'DONE', run: close },
        ]
      : [
          { id: 'title', field: titleRef },
          { id: 'desc', field: descRef as unknown as { current: HTMLInputElement | null } },
          ...(rulesShown ? [{ id: 'TICK', run: () => setTick((t) => !t), disabled: up }] : []),
          { id: 'CANCEL', run: close },
          ...(quota ? [{ id: 'ACCOUNT', run: openAccount }] : []),
          { id: 'CREATE', run: () => void create(), disabled: !canCreate },
        ],
    submit: done ? close : () => void create(),
    canSubmit: done || canCreate,
    back: close,
  });

  if (done && made) {
    return (
      <Dialog
        title="Link created"
        dlg="share-done"
        width={540}
        at={keys.at}
        onCancel={close}
        buttons={[{ id: 'DONE', label: 'Done', letter: 'd', primary: true, run: close }]}
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
          <p class="wc-lk-qn wc-sh-note">{DONE_NOTE}</p>
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
      title="Share as a link"
      dlg="share"
      width={540}
      error={shownError}
      at={keys.at}
      onCancel={close}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'c', run: close },
        ...(quota ? [{ id: 'ACCOUNT', label: 'Open Account', letter: 'a', run: openAccount }] : []),
        { id: 'CREATE', label: up ? 'Creating…' : retry ? 'Try again' : 'Create link', letter: 'l', primary: true, disabled: !canCreate, run: () => void create() },
      ]}
    >
      <div class={'wc-sh' + (up ? ' is-locked' : '')}>
        <form class="wc-ac-dform" noValidate {...keys.form}>
          <Field
            id="title"
            label="Title"
            value={title}
            disabled={up}
            autoFocus
            inputRef={titleRef}
            hint={p.titleIsDefault && title === p.title ? TITLE_HINT : undefined}
            onInput={(v) => setTitle(typedTitle(v))}
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
            onInput={(v) => setDesc(typedDescription(v))}
          />
        </form>
        <p class={'wc-sh-size' + (tooLarge ? ' is-over' : '')} data-size={bytes ?? undefined}>
          <Icon name="save" />
          {sizeLine}
        </p>
        <p class="wc-sh-anyone">
          <Icon {...LINK_ICON} />
          <span>{ANYONE}</span>
        </p>
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
