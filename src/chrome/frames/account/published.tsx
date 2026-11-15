// Published runs on the Account page (stage 64 C1, spec §7.7, ADR 0154;
// round 12's pick 4a: a section after Sync). Only while the flags
// `accounts` and `share` are on; the page is the logged-in account's.
//
//   PUBLISHED RUNS ─────────────────────────────────────────────
//     Clearing the ranger camp      37 views · 15 Nov 2026 · 1.2 MB · link only
//     /r/Ab3dE5fG7hJk [Copy]                            [Edit] [Remove]
//     Trollshaws hoard run           21 views · 3 Nov 2026 · 1.9 MB · link only
//     ⚑ Hidden after reports. Only you can watch it until we have looked.
//     /r/Zp6Wd3Fg5uNa [Copy]                            [Edit] [Remove]
//   4 of 150 · 6.1 MB · links do not count against your 50 MB.
//
// `GET /api/u/pub` when the page opens and after every change. Edit (the
// title and the description) and Remove (with its question) are overlay
// dialogs over the page. Copy puts the whole link on the clipboard and says
// so on the page's flash. Every text from the server is written as text.
//
// The page's keyboard ring takes the rows' buttons (`COPY:<id>`,
// `EDIT:<id>`, `REMOVE:<id>`) from `usePublished().stops`.

import { touchInteraction } from '../../../core/device';
import { h } from 'preact';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_ACCOUNT_LIMITS, type AccountLimits, type MyPub, PUB_DESCRIPTION_MAX } from '../../../../shared/cloud/api.ts';
import { type PubErrorCode, createPubApi, shareEnabled } from '../../../cloud/pub/api';
import { cleanDescription, cleanTitle, codePointCount, linkPath, linkUrl, sizeWords, typedDescription, typedTitle } from '../../../share/link';
import { copyText } from '../../kit/clipboard';
import { Dialog, Field, GlassButton, Icon, Rule, TextArea, lookFrame } from '../../kit/look';
import { type Nav, useNav } from '../../kit/stack';
import { COPY_FAILED, EDIT_NOTE, PUB_EMPTY, PUB_HIDDEN, REMOVE_NOTE, pubFailureWords, pubFigures, pubFoot } from '../share-words';
import type { AccountHost } from './account-page';
import { madeWords } from './account-model';
import { FormError, useFormKeys } from './form';
import { failureWords } from './words';

type Host = () => AccountHost;

export interface PublishedView {
  /** The section is there (the flags are on). */
  shown: boolean;
  /** The keyboard's stops of the section, in order. */
  stops: { id: string; run(): void }[];
  /** Fetches the list again. */
  reload(): void;
  node(at: string | null, limits: AccountLimits | null): VNode | null;
}

const api = createPubApi();

/** The section's state and its node; the page puts the node after Sync. */
export function usePublished(nav: Nav, host: Host): PublishedView {
  const [shown, setShown] = useState(false);
  const [pubs, setPubs] = useState<MyPub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);
  const alive = useRef(true);

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
    void shareEnabled().then((on) => {
      if (!alive.current) return;
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
  const edit = (p: MyPub): void => nav.push(h(EditPubDialog, { host, pub: p, done: load }) as VNode, { overlay: true });
  const remove = (p: MyPub): void => nav.push(h(RemovePubDialog, { host, pub: p, done: load }) as VNode, { overlay: true });

  const stops = !shown
    ? []
    : [
        ...(error ? [{ id: 'PUBRETRY', run: load }] : []),
        ...(pubs ?? []).flatMap((p) => [
          { id: `COPY:${p.id}`, run: () => copy(p) },
          { id: `EDIT:${p.id}`, run: () => edit(p) },
          { id: `REMOVE:${p.id}`, run: () => remove(p) },
        ]),
      ];

  const node = (at: string | null, limits: AccountLimits | null): VNode | null => {
    if (!shown) return null;
    const lim = limits ?? DEFAULT_ACCOUNT_LIMITS;
    const total = (pubs ?? []).reduce((n, p) => n + p.bytes, 0);
    return (
      <>
        <Rule title="Published runs" id="published" />
        <div class="wc-ac-pubs" data-pubs={pubs === null ? 'asking' : pubs.length}>
          {error ? (
            <div class="wc-ac-noload">
              <FormError text={error} id="published" />
              <GlassButton id="PUBRETRY" label="Try again" small selected={at === 'PUBRETRY'} onClick={load} />
            </div>
          ) : pubs === null ? (
            <p class="wc-ac-devs-wait">Asking the server…</p>
          ) : pubs.length === 0 ? (
            <p class="wc-ac-small wc-ac-pub-empty" data-pub-empty="">
              {PUB_EMPTY.slice(0, PUB_EMPTY.lastIndexOf('Link'))}
              <b>Link</b>
              {PUB_EMPTY.slice(PUB_EMPTY.lastIndexOf('Link') + 4)}
            </p>
          ) : (
            <>
              <ul class="wc-lk-rows is-flat wc-ac-publist" aria-label="Published runs">
                {pubs.map((p) => {
                  const hidden = p.state === 'hidden';
                  return (
                    <li key={p.id} class={'wc-lk-row wc-ac-pub' + (hidden ? ' is-hidden' : '')} data-pub={p.id} data-state={p.state}>
                      <div class="wc-ac-pub-l1">
                        <span class="wc-ac-pub-t" data-pub-title="">
                          {p.title}
                        </span>
                        <span class="wc-ac-pub-fig">{pubFigures({ views: p.views, date: madeWords(p.created), size: sizeWords(p.bytes) })}</span>
                      </div>
                      {hidden && (
                        <div class="wc-ac-pub-hid" data-pub-hidden="">
                          <Icon name="flag" />
                          <span>{PUB_HIDDEN}</span>
                        </div>
                      )}
                      <div class="wc-ac-pub-l2">
                        <span class="wc-ac-pub-url" title={linkUrl(p.id)}>
                          {linkPath(p.id)}
                        </span>
                        <GlassButton id="COPY" label="Copy" icon="duplicate" small selected={at === `COPY:${p.id}`} onClick={() => copy(p)} />
                        <span class="wc-ac-pub-sp" />
                        <GlassButton id="EDIT" label="Edit" icon="pencil" small selected={at === `EDIT:${p.id}`} onClick={() => edit(p)} />
                        <GlassButton id="REMOVE" label="Remove" icon="trash" small danger selected={at === `REMOVE:${p.id}`} onClick={() => remove(p)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p class="wc-ac-small wc-ac-pub-foot">
                {pubFoot({ count: pubs.length, limit: lim.sharedRuns, size: sizeWords(total), runBytes: sizeWords(lim.runBytes) })}
              </p>
            </>
          )}
        </div>
      </>
    );
  };

  return { shown, stops, reload: load, node };
}

/** A failure the dialogs need no words for: the session is gone (the page leaves for Log in). */
function gone(host: AccountHost, code: PubErrorCode): boolean {
  if (code !== 'unauthorized') return false;
  host.toLogin(failureWords('unauthorized', 'account'));
  return true;
}

/** The link without its scheme, for the Edit dialog's note ("mumecockpit.com/r/…"). */
const bareLink = (id: string): string => linkUrl(id).replace(/^https?:\/\//, '');

// ------------------------------------------------------------ Edit

export const EditPubDialog = lookFrame(function EditPubDialog(p: { host: Host; pub: MyPub; done(): void }): VNode {
  const nav = useNav();
  const [title, setTitle] = useState(p.pub.title);
  const [desc, setDesc] = useState(p.pub.description.replace(/\s+/g, ' '));
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
  const t = cleanTitle(title);
  const d = cleanDescription(desc);
  const changed = t !== p.pub.title || d !== p.pub.description;
  const canSave = !busy && t !== '' && changed;
  const cancel = (): void => {
    if (!busy) nav.pop();
  };
  const save = async (): Promise<void> => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const host = p.host();
    const r = await createPubApi().edit(p.pub.id, { ...(t !== p.pub.title ? { title: t } : {}), ...(d !== p.pub.description ? { description: d } : {}) });
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
          <Field id="title" label="Title" value={title} disabled={busy} autoFocus={!touchInteraction()} inputRef={titleRef} onInput={(v) => setTitle(typedTitle(v))} />
          <TextArea
            id="desc"
            label="Description"
            value={desc}
            rows={3}
            disabled={busy}
            enterSubmits
            inputRef={descRef}
            hint={<span class="wc-ac-pub-count">{`${n} / ${PUB_DESCRIPTION_MAX}`}</span>}
            onInput={(v) => setDesc(typedDescription(v))}
          />
        </form>
        <p class="wc-lk-qn wc-ac-pub-note">
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
