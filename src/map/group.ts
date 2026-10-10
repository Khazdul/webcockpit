// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// Group mates on the map (ADR 0020 "Group mates", research
// notes/research/mmapper-rendering.md §7). Pure; runs in the map worker.
// The app's GroupModel (src/gmcp/group.ts) is separate and unchanged.
//
// Ported from MMapper 26.06.0 (GPL-2.0-or-later): group/mmapper2group.cpp
// (member table by Group.* id, Group.Set/Add/Update/Remove), group/
// CGroupChar.cpp `updateFromGmcp` (`mapid`, `name`, `label`, `type`) and
// group/ColorGenerator.cpp (golden-angle hues from the player's colour,
// released hues reused first).
//
// - The table is keyed by the Group.* id, in insertion order. Group.Set
//   replaces it without releasing colours (as MMapper's resetChars);
//   Group.Add replaces an entry with the same id (its colour is released
//   first, so it usually gets it back); Group.Update of an unknown id adds
//   it; Group.Remove (a bare integer) releases the colour.
// - `type: "you"` is the player: kept out of the table and never given a
//   colour (MMapper keeps it as `self`; a quirk where a second "you" entry
//   consumes a hue is not reproduced).
// - `mapid` is MUME's server room id; the caller resolves it to a room.

import type { SceneMember } from './scene';

/** MMapper's default player colour (groupManager.color). */
export const PLAYER_COLOR = 0xffff00;

/** Qt `QColor::fromHsl(h, 255, 127)` as 0xRRGGBB (h in degrees). */
export function hslColor(h: number, s = 255, l = 127): number {
  const hh = (((h % 360) + 360) % 360) / 60;
  const sf = s / 255;
  const lf = l / 255;
  const c = (1 - Math.abs(2 * lf - 1)) * sf;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = lf - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number): number => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

/** The hue (degrees, 0…359) of 0xRRGGBB, as `QColor::hue()`. */
export function hueOf(rgb: number): number {
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

/** MMapper's ColorGenerator: golden-angle hues, released hues first. */
export class ColorGenerator {
  static readonly GOLDEN_ANGLE = 137.508;
  private hue: number;
  private prev: number[] = [];

  constructor(playerColor = PLAYER_COLOR) {
    this.hue = hueOf(playerColor);
  }

  /** The next hue (degrees). */
  next(): number {
    const p = this.prev.shift();
    if (p !== undefined) return p;
    this.hue = (this.hue + ColorGenerator.GOLDEN_ANGLE) % 360;
    return Math.trunc(this.hue + 0.5) % 360;
  }

  release(hue: number): void {
    this.prev.push(hue);
  }

  /** The last hue handed out and the released hues (a copy). */
  state(): { hue: number; released: number[] } {
    return { hue: this.hue, released: [...this.prev] };
  }
}

/** One member of the map's group table. */
export interface GroupTableEntry {
  id: number;
  name: string;
  label: string;
  type: string;
  /** Server room id from `mapid` (0 = none). */
  mapid: number;
  hue: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const intId = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** The map's group member table. `apply` returns true when something drawn may have changed. */
export class GroupTable {
  private readonly byId = new Map<number, GroupTableEntry>();
  private readonly colors: ColorGenerator;

  constructor(playerColor = PLAYER_COLOR) {
    this.colors = new ColorGenerator(playerColor);
  }

  get size(): number {
    return this.byId.size;
  }

  /** True when `id` is in the table. */
  has(id: number): boolean {
    return this.byId.has(id);
  }

  /** The entries in table order, as copies (the replay export's state fold, tests). */
  entries(): GroupTableEntry[] {
    return [...this.byId.values()].map((e) => ({ ...e }));
  }

  /** The colour generator's state: its last hue and the released hues in reuse order. */
  colorState(): { hue: number; released: number[] } {
    return this.colors.state();
  }

  /** Applies a Group.* message (package compared case-insensitively). */
  apply(pkg: string, data: unknown): boolean {
    switch (pkg.toLowerCase()) {
      case 'group.set':
        return this.set(data);
      case 'group.add':
        return isObj(data) ? this.add(data) : false;
      case 'group.update':
        return isObj(data) ? this.update(data) : false;
      case 'group.remove': {
        const id = intId(data) ?? (isObj(data) ? intId(data.id) : null);
        return id !== null && this.remove(id);
      }
      default:
        return false;
    }
  }

  /** Forgets everything (disconnect). */
  clear(): boolean {
    if (this.byId.size === 0) return false;
    for (const e of this.byId.values()) if (e.type !== 'you') this.colors.release(e.hue);
    this.byId.clear();
    return true;
  }

  private set(data: unknown): boolean {
    const had = this.byId.size > 0;
    this.byId.clear();
    if (!Array.isArray(data)) return had;
    for (const o of data) if (isObj(o)) this.add(o);
    return true;
  }

  private add(o: Obj): boolean {
    const id = intId(o.id);
    if (id === null) return false;
    this.remove(id);
    const e: GroupTableEntry = { id, name: '', label: '', type: '', mapid: 0, hue: -1 };
    this.merge(e, o);
    if (e.type === 'you') return true;
    e.hue = this.colors.next();
    this.byId.set(id, e);
    return true;
  }

  private update(o: Obj): boolean {
    const id = intId(o.id);
    if (id === null) return false;
    const e = this.byId.get(id);
    if (!e) return this.add(o);
    const before = `${e.name}\u0000${e.label}\u0000${e.type}\u0000${e.mapid}`;
    this.merge(e, o);
    if (e.type === 'you') {
      this.remove(id);
      return true;
    }
    return before !== `${e.name}\u0000${e.label}\u0000${e.type}\u0000${e.mapid}`;
  }

  private remove(id: number): boolean {
    const e = this.byId.get(id);
    if (!e) return false;
    this.byId.delete(id);
    if (e.hue >= 0) this.colors.release(e.hue);
    return true;
  }

  /** CGroupChar::updateFromGmcp for the fields the map uses (a non-string `label`, e.g. MUME's 0, is ignored). */
  private merge(e: GroupTableEntry, o: Obj): void {
    const mapid = intId(o.mapid);
    if (mapid !== null) e.mapid = mapid > 0 ? mapid : 0;
    if (typeof o.name === 'string') e.name = o.name;
    if (typeof o.label === 'string') e.label = o.label;
    if (typeof o.type === 'string') e.type = o.type;
  }

  /** The members to draw, in table order; `resolve` maps a server id to a room (or null). */
  members(resolve: (serverId: number) => number | null): SceneMember[] {
    const out: SceneMember[] = [];
    for (const e of this.byId.values()) {
      out.push({
        id: e.id,
        room: e.mapid > 0 ? resolve(e.mapid) : null,
        text: e.label.trim() !== '' ? e.label : e.name,
        color: hslColor(e.hue),
        npc: e.type === 'npc',
      });
    }
    return out;
  }
}
