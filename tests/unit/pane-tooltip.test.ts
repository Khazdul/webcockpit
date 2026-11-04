// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { PANE_TIP_DELAY_MS, installPaneTooltip, setTip, tipPlace } from '../../src/panes/pane-tooltip';

describe('tipPlace', () => {
  it('goes below the anchor, centred, inside the viewport', () => {
    expect(tipPlace({ left: 100, top: 50, bottom: 70, width: 40 }, 60, 30, 800, 600)).toEqual({ left: 90, top: 76 });
  });
  it('goes above when there is no room below', () => {
    expect(tipPlace({ left: 100, top: 570, bottom: 590, width: 40 }, 60, 30, 800, 600)).toEqual({ left: 90, top: 534 });
  });
  it('is kept off the left and right edges', () => {
    expect(tipPlace({ left: 0, top: 50, bottom: 70, width: 10 }, 100, 30, 800, 600).left).toBe(4);
    expect(tipPlace({ left: 790, top: 50, bottom: 70, width: 10 }, 100, 30, 800, 600).left).toBe(696);
  });
});

describe('PaneTooltip', () => {
  afterEach(() => {
    installPaneTooltip(document).dispose();
    document.body.innerHTML = '';
  });

  it('is one per document', () => {
    expect(installPaneTooltip(document)).toBe(installPaneTooltip(document));
  });

  it('shows title and text, hides on leave; detach removes the listeners', async () => {
    const tip = installPaneTooltip(document);
    const root = document.createElement('div');
    const detach = tip.attach(root);
    const a = document.createElement('span');
    setTip(a, 'HP 37/158 · 23%', 'Taube');
    root.append(a);
    document.body.append(root);
    a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(tip.el.hidden).toBe(true);
    await new Promise((r) => setTimeout(r, PANE_TIP_DELAY_MS + 30));
    expect(tip.el.hidden).toBe(false);
    expect(tip.el.textContent).toBe('TaubeHP 37/158 · 23%');
    a.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    expect(tip.el.hidden).toBe(true);
    expect(tip.el.isConnected).toBe(false);
    tip.show(a);
    expect(tip.el.isConnected).toBe(true);
    detach();
    expect(tip.el.isConnected).toBe(false);
    a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, PANE_TIP_DELAY_MS + 30));
    expect(tip.el.hidden).toBe(true);
  });

  it('refresh follows a rebuilt anchor by its key, else hides', () => {
    const tip = installPaneTooltip(document);
    const a = document.createElement('span');
    setTip(a, '3:12 left', 'Sanctuary', 'm2:sanct');
    document.body.append(a);
    tip.show(a);
    a.remove();
    const b = document.createElement('span');
    setTip(b, '3:11 left', 'Sanctuary', 'm2:sanct');
    document.body.append(b);
    tip.refresh();
    expect(tip.target).toBe(b);
    expect(tip.el.textContent).toContain('3:11 left');
    b.remove();
    tip.refresh();
    expect(tip.el.hidden).toBe(true);
  });

  it('a hovered element rebuilt during the delay still gets its tooltip, by its key', async () => {
    const tip = installPaneTooltip(document);
    const root = document.createElement('div');
    tip.attach(root);
    document.body.append(root);
    const a = document.createElement('span');
    setTip(a, 'Loses HP over time.', 'Poisoned', 'm3:poison');
    root.append(a);
    a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    a.remove();
    const b = document.createElement('span');
    setTip(b, 'Loses HP over time.', 'Poisoned', 'm3:poison');
    root.append(b);
    await new Promise((r) => setTimeout(r, PANE_TIP_DELAY_MS + 30));
    expect(tip.target).toBe(b);
    expect(tip.el.hidden).toBe(false);
  });

  it('a scroll elsewhere (the game output) keeps it; a scroll of its container hides it', () => {
    const tip = installPaneTooltip(document);
    const pane = document.createElement('div');
    const out = document.createElement('div');
    const a = document.createElement('span');
    setTip(a, 'Loses HP over time.', 'Poisoned');
    pane.append(a);
    document.body.append(pane, out);
    tip.show(a);
    out.dispatchEvent(new Event('scroll'));
    expect(tip.el.hidden).toBe(false);
    pane.dispatchEvent(new Event('scroll'));
    expect(tip.el.hidden).toBe(true);
  });

  it('leaves out a body that only repeats the title', () => {
    const tip = installPaneTooltip(document);
    const root = document.createElement('div');
    tip.attach(root);
    const a = document.createElement('span');
    setTip(a, 'HP 132/160 · 83%', 'HP 132/160 · 83%');
    root.append(a);
    document.body.append(root);
    tip.show(a);
    expect(tip.el.textContent).toBe('HP 132/160 · 83%');
  });

  it('setTip(null) clears the data', () => {
    const a = document.createElement('span');
    setTip(a, 'x', 'y', 'k');
    setTip(a, null);
    expect(a.dataset.tip).toBeUndefined();
    expect(a.dataset.tipTitle).toBeUndefined();
    expect(a.dataset.tipKey).toBeUndefined();
  });
});
