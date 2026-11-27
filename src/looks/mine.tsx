// The picker's "My images" tab (stage 80 §3, §5, part D, ADR 0172): the
// shelf of own images and the crop step; logged out, the login card. The
// look is the mockup's (notes/research/token-mockups/round2.html, "My
// images" and "Crop image").
//
//   shelf   a scrolling grid of the images, an Add image slot, the empty
//           slots up to the limit; "n of 50 images · Only you see them";
//           the chosen image's Remove (which says how many characters use
//           it, and puts those back on automatic); a plain line for what
//           went wrong (a full shelf, a file that is no picture, an image
//           the account refused)
//   crop    the picture in a square with pan (drag, the arrow keys) and
//           zoom (the wheel, pinch, the slider, + and −), the dashed circle
//           the token's cut; Save image encodes 256 × 256 (src/looks/crop.ts)
//           and puts it on the shelf, chosen
//
// The original file never leaves the browser; only the encoded square is
// kept (and synced, encrypted, to the account).

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { LOOK_IMAGES_MAX, LOOK_IMAGE_TARGET_BYTES } from '../../shared/cloud/api.ts';
import type { NavKey } from '../chrome/kit/nav';
import { onSyncView, syncView } from '../cloud/sync-view';
import type { FullReason } from '../cloud/sync/types';
import { type CropState, cropClamp, cropPan, cropRect, cropStart, cropZoom, decodeFile, encodeSquare, imageLabel, ZOOM_MAX } from './crop';
import type { LooksStore } from './store';
import type { LookRef } from './types';

/** The picker's key ring asks the tab first: true when it took the key. */
export type MineKeys = (cur: HTMLElement, e: KeyboardEvent, nk: NavKey | null) => boolean;

/** The crop view's side, CSS px (the mockup's 240). */
const VIEW = 240;

/** Why the account refused an image, as a player reads it. */
export function refusedWords(label: string, why: FullReason): string {
  const reason =
    why === 'item_too_large'
      ? 'it is larger than the account takes for one image'
      : why === 'too_many_items'
        ? 'the account already has as many images as it may'
        : "the account's room for images is full";
  return `“${label || 'An image'}” is not in your account: ${reason}. It stays on this device.`;
}

/** What removing an image does to the characters that use it. */
export function removeWords(users: readonly string[]): string {
  if (users.length === 0) return 'No character uses this image.';
  const cap = (n: string): string => n.charAt(0).toUpperCase() + n.slice(1);
  const names = users.slice(0, 3).map(cap).join(', ') + (users.length > 3 ? ` and ${users.length - 3} more` : '');
  return users.length === 1 ? `${names} uses this image and goes back to automatic.` : `${users.length} characters use this image (${names}). They go back to automatic.`;
}

export const FULL_WORDS = (max: number): string => `Your shelf is full (${max} of ${max}). Remove an image first.`;
export const UNDECODABLE_WORDS = 'This file could not be opened as a picture. Try a PNG, JPEG or WebP.';
export const TOO_BIG_WORDS = 'This picture does not fit in 30 KB even at the lowest quality. Zoom in, or try a simpler picture.';

interface MineProps {
  looks: LooksStore;
  sel: LookRef;
  choose(look: LookRef): void;
  keys: { current: MineKeys | null };
  canLeave?: () => boolean;
  /** An image left the shelf (the picker drops it from its selection). */
  onRemoved(id: string): void;
}

/** The shelf's limit: the account's, as the last sync heard it, else the default. */
function useLimit(): number {
  const [n, setN] = useState(() => syncView().status?.limits?.lookImages ?? LOOK_IMAGES_MAX);
  useEffect(
    () =>
      onSyncView((v) => {
        const l = v.status?.limits?.lookImages;
        if (typeof l === 'number') setN(l);
      }),
    [],
  );
  return n;
}

/** The images the account refused, read again whenever the sync's state changes. */
function useRefused(looks: LooksStore): Map<string, FullReason> {
  const [m, setM] = useState<Map<string, FullReason>>(new Map());
  useEffect(() => {
    let live = true;
    const read = (): void => void looks.images?.refused().then((r) => live && setM(r));
    read();
    const off = onSyncView(read);
    const offLooks = looks.subscribe(read);
    return () => {
      live = false;
      off();
      offLooks();
    };
  }, []);
  return m;
}

export function MineTab(p: MineProps): VNode {
  const images = p.looks.images;
  if (!images?.enabled) return <LoginCard {...(p.canLeave ? { canLeave: p.canLeave } : {})} />;
  return <Shelf {...p} />;
}

function LoginCard(p: { canLeave?: () => boolean }): VNode {
  const [note, setNote] = useState<string | null>(null);
  const login = (): void => {
    if (p.canLeave && !p.canLeave()) {
      setNote('Leave the game first, then log in from the start page.');
      return;
    }
    const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
    location.assign(`${base}?account=login`);
  };
  return (
    <div class="wc-looks-mine">
      <div class="wc-looks-out" data-mine="login">
        <span class="wc-looks-sub">Your own images</span>
        <p>
          <b>Log in to use your own images.</b>
        </p>
        <p>They are kept in your account, so they follow you to your other devices, and only you ever see them.</p>
        <p>The library and the automatic drawings work without one.</p>
        <button type="button" class="wc-looks-b is-small" data-btn="LOGIN" tabIndex={-1} onClick={login}>
          Log in
        </button>
        {note && (
          <p class="wc-looks-msg" role="status">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

interface Cropping {
  bmp: ImageBitmap;
  label: string;
  st: CropState;
}

function Shelf(p: MineProps): VNode {
  const images = p.looks.images!;
  const list = images.list();
  const max = useLimit();
  const refused = useRefused(p.looks);
  const [msg, setMsg] = useState<string | null>(null);
  const [crop, setCrop] = useState<Cropping | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const full = list.length >= max;
  const chosen = p.sel.src === 'own' ? (images.get(p.sel.id) ?? null) : null;

  useEffect(() => () => crop?.bmp.close(), [crop?.bmp]);

  const add = (): void => {
    setConfirm(null);
    if (full) {
      setMsg(FULL_WORDS(max));
      return;
    }
    setMsg(null);
    file.current?.click();
  };

  const picked = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    const bmp = await decodeFile(f);
    if (file.current) file.current.value = '';
    if (!bmp) {
      setMsg(UNDECODABLE_WORDS);
      return;
    }
    setMsg(null);
    setCrop({ bmp, label: imageLabel(f.name), st: cropStart(bmp.width, bmp.height, VIEW) });
  };

  const saved = (id: string): void => {
    setCrop(null);
    p.choose({ src: 'own', id });
  };

  if (crop) return <CropStep crop={crop} setCrop={setCrop} images={images} keys={p.keys} back={() => setCrop(null)} saved={saved} />;

  p.keys.current = null;
  const firstRefused = list.find((i) => refused.has(i.id));
  const users = confirm ? p.looks.usersOf(confirm) : [];
  return (
    <div class="wc-looks-mine">
      <div class="wc-looks-shelfbox">
        <div class="wc-looks-shelf" role="listbox" aria-label="Your images">
          {list.map((img, i) => {
            const on = p.sel.src === 'own' && p.sel.id === img.id;
            const why = refused.get(img.id);
            return (
              <button
                key={img.id}
                type="button"
                class="wc-looks-it wc-looks-slot is-full"
                data-id={img.id}
                data-refused={why ?? undefined}
                tabIndex={-1}
                aria-pressed={on ? 'true' : 'false'}
                title={why ? refusedWords(img.label, why) : img.label || `Your image ${i + 1}`}
                onClick={() => {
                  setConfirm(null);
                  p.choose({ src: 'own', id: img.id });
                }}
              >
                <img src={images.src(img.id) ?? ''} alt="" draggable={false} />
              </button>
            );
          })}
          <button type="button" class="wc-looks-it wc-looks-slot is-add" data-btn="ADD" tabIndex={-1} data-full={full ? '' : undefined} title={full ? FULL_WORDS(max) : 'Add image'} onClick={add}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14 M5 12h14" />
            </svg>
            Add image
          </button>
          {Array.from({ length: Math.max(0, max - list.length - 1) }, (_, i) => (
            <span key={`e${i}`} class="wc-looks-slot" aria-hidden="true" />
          ))}
        </div>
        <div class="wc-looks-count">
          <span>
            <b>
              {list.length} of {max}
            </b>{' '}
            images
          </span>
          <span>Only you see them</span>
        </div>
        {chosen && !confirm && (
          <div class="wc-looks-rm">
            <span class="wc-looks-rmname">{chosen.label || 'This image'}</span>
            <button type="button" class="wc-looks-b is-small" data-btn="REMOVE" tabIndex={-1} onClick={() => (setMsg(null), setConfirm(chosen.id))}>
              Remove
            </button>
          </div>
        )}
        {confirm && (
          <div class="wc-looks-rm is-ask" role="alert">
            <span>Remove this image? {removeWords(users)}</span>
            <span class="wc-looks-rmb">
              <button
                type="button"
                class="wc-looks-b is-small"
                data-btn="REMOVE-YES"
                tabIndex={-1}
                onClick={() => {
                  const id = confirm;
                  setConfirm(null);
                  p.onRemoved(id);
                  void p.looks.removeImage(id);
                }}
              >
                Remove image
              </button>
              <button type="button" class="wc-looks-b is-small" data-btn="REMOVE-NO" tabIndex={-1} onClick={() => setConfirm(null)}>
                Keep
              </button>
            </span>
          </div>
        )}
        {(msg || firstRefused) && (
          <p class="wc-looks-msg" role="status">
            {msg ?? refusedWords(firstRefused!.label, refused.get(firstRefused!.id)!)}
          </p>
        )}
        <p class="wc-looks-hint">PNG, JPEG or WebP. Cropped to a square here in the browser and saved as 256 × 256.</p>
      </div>
      <input ref={file} class="wc-looks-file" type="file" accept="image/*" hidden tabIndex={-1} onChange={(e) => void picked((e.currentTarget as HTMLInputElement).files?.[0])} />
    </div>
  );
}

function CropStep(p: {
  crop: Cropping;
  setCrop(c: Cropping | null): void;
  images: NonNullable<LooksStore['images']>;
  keys: { current: MineKeys | null };
  back(): void;
  saved(id: string): void;
}): VNode {
  const { crop } = p;
  const st = crop.st;
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const latest = useRef(crop);
  latest.current = crop;
  const set = (next: CropState): void => p.setCrop({ ...latest.current, st: next });

  // The view: the picture drawn where the crop says, at the device's pixels.
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = c.ownerDocument.defaultView?.devicePixelRatio || 1;
    const side = Math.round(VIEW * dpr);
    if (c.width !== side) c.width = c.height = side;
    const g = c.getContext('2d');
    if (!g) return;
    const r = cropRect(st, side);
    g.clearRect(0, 0, side, side);
    g.imageSmoothingQuality = 'high';
    g.drawImage(crop.bmp, r.dx, r.dy, r.dw, r.dh);
  }, [st.x, st.y, st.zoom, crop.bmp]);

  // The file's size at this crop, a moment after the last change.
  useEffect(() => {
    let live = true;
    setSize(null);
    const t = setTimeout(() => {
      void encodeSquare(crop.bmp, st, document.createElement('canvas'), LOOK_IMAGE_TARGET_BYTES).then((r) => live && setSize(r.ok ? r.bytes.length : -1));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [st.x, st.y, st.zoom, crop.bmp]);

  // Keys: the arrows move the picture, + and − zoom; on the slider the arrows zoom.
  p.keys.current = (cur, e, nk) => {
    const s = latest.current.st;
    const onArea = cur === area.current;
    const onZoom = cur.classList.contains('wc-looks-zoomr');
    if (!onArea && !onZoom) return false;
    const step = e.shiftKey ? 32 : 8;
    if (onArea && (nk === 'left' || nk === 'right' || nk === 'up' || nk === 'down')) {
      set(cropPan(s, nk === 'left' ? -step : nk === 'right' ? step : 0, nk === 'up' ? -step : nk === 'down' ? step : 0));
      return true;
    }
    const zin = e.key === '+' || e.key === '=' || (onZoom && (nk === 'right' || nk === 'up'));
    const zout = e.key === '-' || e.key === '_' || (onZoom && (nk === 'left' || nk === 'down'));
    if (zin || zout) {
      set(cropZoom(s, s.zoom * (zin ? 1.1 : 1 / 1.1)));
      return true;
    }
    return false;
  };
  useEffect(() => () => void (p.keys.current = null), []);

  // Drag to move; two fingers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);
  const down = (e: PointerEvent): void => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, zoom: latest.current.st.zoom };
    }
  };
  const move = (e: PointerEvent): void => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = latest.current.st;
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      set(cropZoom(s, pinch.current.zoom * (d / pinch.current.d)));
      return;
    }
    const r = area.current?.getBoundingClientRect();
    const k = r && r.width ? VIEW / r.width : 1;
    set(cropPan(s, (e.clientX - prev.x) * k, (e.clientY - prev.y) * k));
  };
  const up = (e: PointerEvent): void => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = area.current?.getBoundingClientRect();
    const s = latest.current.st;
    const k = r && r.width ? VIEW / r.width : 1;
    const ax = r ? (e.clientX - r.left - r.width / 2) * k : 0;
    const ay = r ? (e.clientY - r.top - r.height / 2) * k : 0;
    set(cropZoom(s, s.zoom * Math.exp(-e.deltaY * 0.0015), ax, ay));
  };
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await encodeSquare(crop.bmp, cropClamp(st), document.createElement('canvas'), LOOK_IMAGE_TARGET_BYTES);
    if (!r.ok) {
      setBusy(false);
      setMsg(r.why === 'big' ? TOO_BIG_WORDS : 'The browser could not save this picture.');
      return;
    }
    try {
      const img = await p.images.add(r.bytes, crop.label);
      p.saved(img.id);
    } catch {
      setBusy(false);
      setMsg('The picture could not be put on the shelf.');
    }
  };

  const kb = size === null ? '…' : size < 0 ? 'too large' : `${Math.max(1, Math.round(size / 1024))} KB`;
  return (
    <div class="wc-looks-crop" data-mine="crop">
      <span class="wc-looks-sub">Crop image</span>
      <div
        ref={area}
        class="wc-looks-croparea"
        tabIndex={-1}
        role="img"
        aria-label="The picture: drag or the arrow keys to move it, the wheel or + and − to zoom"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <canvas ref={canvas} />
        <span class="wc-looks-cut" />
        <i class="wc-looks-cn is-a" />
        <i class="wc-looks-cn is-b" />
        <i class="wc-looks-cn is-c" />
        <i class="wc-looks-cn is-d" />
      </div>
      <label class="wc-looks-zoom">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M15.3 15.3L20 20 M8 10.5h5" />
        </svg>
        <input
          class="wc-looks-zoomr"
          type="range"
          min="100"
          max={String(ZOOM_MAX * 100)}
          value={String(Math.round(st.zoom * 100))}
          aria-label="Zoom"
          tabIndex={-1}
          onInput={(e) => set(cropZoom(latest.current.st, Number((e.currentTarget as HTMLInputElement).value) / 100))}
        />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M15.3 15.3L20 20 M8 10.5h5 M10.5 8v5" />
        </svg>
      </label>
      <div class="wc-looks-meta">
        <span>Drag to move. The circle is the token.</span>
        <b>256 × 256 · {kb}</b>
      </div>
      {msg && (
        <p class="wc-looks-msg" role="status">
          {msg}
        </p>
      )}
      <div class="wc-looks-cropbtns">
        <button type="button" class="wc-looks-b" data-btn="CROP-BACK" tabIndex={-1} onClick={p.back}>
          Back
        </button>
        <button type="button" class="wc-looks-b is-go" data-btn="CROP-SAVE" tabIndex={-1} aria-disabled={busy ? 'true' : undefined} onClick={() => void save()}>
          Save image
        </button>
      </div>
    </div>
  );
}
