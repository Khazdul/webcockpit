// Automatic login for the session (ADR 0141): where the password is.
//
// The ONLY place a password is held by the client. In this page's memory
// and nowhere else: never written to settings, localStorage,
// sessionStorage, IndexedDB, the run log, the command history or the DOM,
// and never logged. It is gone when the page is closed or reloaded.
//
// Two slots:
// - `pending`: the password of the login the player is typing by hand,
//   kept from the moment it is sent until the question is answered (or the
//   login turns out not to be one to ask about).
// - `stored`: the password of the armed session.
//
// The fields are private (`#`): nothing outside this class can read them,
// they are not enumerable, and the object serialises as `{}`. There is no
// getter. The one way out is `use`, which hands the stored password to one
// function for the length of one call (the controller's send).

export class LoginVault {
  #pending: string | null = null;
  #stored: string | null = null;

  /** Keeps `password` as the pending one (replacing an earlier one). An empty one is not kept. */
  keepPending(password: string): void {
    this.#pending = password === '' ? null : password;
  }

  dropPending(): void {
    this.#pending = null;
  }

  /** The pending password becomes the stored one. False (and nothing stored) when there is none pending. */
  arm(): boolean {
    this.#stored = this.#pending;
    this.#pending = null;
    return this.#stored !== null;
  }

  /** Forgets both. */
  wipe(): void {
    this.#pending = null;
    this.#stored = null;
  }

  /** True while a password is stored (never the password). */
  get armed(): boolean {
    return this.#stored !== null;
  }

  /** Calls `send` once with the stored password. False (and no call) when none is stored. */
  use(send: (password: string) => void): boolean {
    if (this.#stored === null) return false;
    send(this.#stored);
    return true;
  }

  /** Nothing of the vault is ever serialised. */
  toJSON(): Record<string, never> {
    return {};
  }
}
