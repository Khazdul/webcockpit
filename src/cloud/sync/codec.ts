// Item bodies in and out of the blob format (spec §7.3, ADR 0145): the
// associated data is the item's kind and opaque server id, so the server
// cannot hand one item's blob out as another's. The opaque id is
// `opaqueId(idKey, kind, localKey)`, the local key being the profile or
// script `id`, so a rename keeps the item.

import type { SyncKind } from '../../../shared/cloud/api.ts';
import { fromBase64Url } from '../crypto/base64url';
import { open, seal } from '../crypto/blob';
import { isCryptoError } from '../crypto/errors';
import { opaqueId } from '../crypto/ids';
import { type Decoded, type KindSpec, decodeBody, encodeBody } from './items';
import type { Body, SyncKeys } from './types';

export class ItemCodec {
  private readonly ids = new Map<string, string>();

  constructor(private readonly keys: SyncKeys) {}

  /** The server id of local key `key` (cached: one HMAC per item and page life). */
  async serverId(kind: SyncKind, key: string): Promise<string> {
    const k = `${kind}\n${key}`;
    let id = this.ids.get(k);
    if (id === undefined) {
      id = await opaqueId(this.keys.idKey, kind, key);
      this.ids.set(k, id);
    }
    return id;
  }

  /** The blob of a record. */
  async seal(spec: KindSpec, serverId: string, body: Body): Promise<Uint8Array<ArrayBuffer>> {
    return seal(this.keys.dataKey, spec.kind, serverId, await encodeBody(spec, body));
  }

  /**
   * The record in a pulled blob (base64url). `newer` for a blob or body
   * version this client does not know; `unreadable` when it does not open,
   * is not a body, or is a body whose key does not give `serverId` (an item
   * written under another's id).
   */
  async open(spec: KindSpec, serverId: string, blob: string): Promise<Decoded> {
    let plain: Uint8Array;
    try {
      plain = await open(this.keys.dataKey, spec.kind, serverId, fromBase64Url(blob));
    } catch (e) {
      return { ok: false, why: isCryptoError(e, 'unknown_version') ? 'newer' : 'unreadable' };
    }
    const d = await decodeBody(spec, plain);
    if (d.ok && (await this.serverId(spec.kind, spec.key(d.body))) !== serverId) return { ok: false, why: 'unreadable' };
    return d;
  }
}
