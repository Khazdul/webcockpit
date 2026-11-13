// @vitest-environment happy-dom
// Stage 55: the cover a phone gets when the phone layout's chunk cannot be
// loaded or its layer cannot be mounted.
import { describe, expect, it, vi } from 'vitest';
import { PHONE_FAILED_TEXT, showPhoneFailed } from '../../src/app/phone-failed';

describe('showPhoneFailed', () => {
  it('covers the app with the notice and a Reload button', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const reload = vi.fn();
    const cover = showPhoneFailed(root, reload);
    expect(cover.parentElement).toBe(root);
    expect(cover.getAttribute('role')).toBe('alert');
    expect(cover.style.position).toBe('fixed');
    expect(cover.querySelector('p')!.textContent).toBe(PHONE_FAILED_TEXT);
    expect(PHONE_FAILED_TEXT).toBe('The phone layout could not be loaded. Check the connection and reload.');
    const button = cover.querySelector('button')!;
    expect(button.textContent).toBe('Reload');
    expect(reload).not.toHaveBeenCalled();
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
    root.remove();
  });

  it('is shown once: the chunk and the mount may both report the failure', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const first = showPhoneFailed(root, () => {});
    expect(showPhoneFailed(root, () => {})).toBe(first);
    expect(root.querySelectorAll('.wc-phone-failed')).toHaveLength(1);
    root.remove();
  });
});
