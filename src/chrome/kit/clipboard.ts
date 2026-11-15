// Copying text (the recovery code, stage 60; a share link, stage 64 C1).

/** Puts `text` on the clipboard; false when the browser would not. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* not allowed here: the old way below */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
    document.body.append(el);
    const back = document.activeElement as HTMLElement | null;
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    back?.focus?.({ preventScroll: true });
    return ok;
  } catch {
    return false;
  }
}
