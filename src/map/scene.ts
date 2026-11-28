// Dynamic scene state (ADR 0020): what the tracking side (P2) hands the
// renderer (P1) besides the static map. Owned by the worker; the renderer
// only reads it. Room values are MapData room indices.

import type { TokenColors, TokenFace } from './protocol';

/** A group mate drawn on the map (research §7). */
export interface SceneMember {
  /** Group.* id (stable while the member is in the group table). */
  id: number;
  /** Room index, or null when `mapid` does not resolve. */
  room: number | null;
  /** Label text: `label` if set, else `name`. */
  text: string;
  /** 0xRRGGBB, from MMapper's colour generator. */
  color: number;
  npc: boolean;
  /** An NPC with a label (MUME's non-empty `label`; stage 80 part G): absent counts as labeled. */
  labeled?: boolean;
}

/** A script's map mark this frame (ADR 0057). */
export interface SceneMark {
  /** Room indices, nearest to the player first. */
  rooms: readonly number[];
  /** 0xRRGGBB. */
  color: number;
  /** 0…1 this frame (blink and fade). */
  alpha: number;
  arrows: boolean;
  label?: string;
}

/**
 * The tokens (stage 80 §7, ADR 0171), from the main thread's `tokens`
 * message: present only while `mapper.tokens` is on. The renderer draws
 * them at TOKEN_MIN_PX CSS px a room and more, outside the far style;
 * else today's boxes.
 */
export interface SceneTokens {
  /** The HP arc (`mapper.tokenHp`). */
  hp: boolean;
  self: TokenFace;
  /** By Group.* id; a member without one draws the disc and the ring only. */
  members: ReadonlyMap<number, TokenFace>;
  colors: TokenColors;
}

export interface Scene {
  /** The player's room, or null before the first match. */
  room: number | null;
  /** False when the last Room.Info did not match (MMapper "far" marker style). */
  located: boolean;
  /** 0xRRGGBB, the player's colour (MMapper default #FFFF00). */
  color: number;
  /** Predicted rooms after `room`, in order (prespam path). */
  path: readonly number[];
  /** Group mates other than the player. */
  members: readonly SceneMember[];
  /** Script marks (absent: none). */
  marks?: readonly SceneMark[];
  /** Tokens (absent: today's boxes). */
  tokens?: SceneTokens;
}

export const EMPTY_SCENE: Scene = { room: null, located: false, color: 0xffff00, path: [], members: [] };
