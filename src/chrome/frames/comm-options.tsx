// Options → Panes → Communication (Inv §2.7.6, Cockpit ADR 0129): the ten
// fixed channels as `[X]███ Narrates` rows (checkbox, a swatch in the
// channel colour, grey when off, the label): the channels Public shows (ADR
// 0134), and `[ ]    NPCs` (NPCs' talk in Public, off by default); then `Chats: active in the last 30 min` (Enter steps 10, 30, 60
// min, All) and Back. Every change goes to the settings store at once, so
// the Comm pane follows live (ADR 0010). The rows are shared with the Comm
// gear popup (../pane-options-model.ts).

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { COMM_CHANNEL_ORDER } from '../../gmcp/comm';
import {
  COMM_CHAT_WINDOW_CHOICES,
  commChannelRows,
  nextChatWindow,
  setChatWindow,
  setCommNpcs,
  toggleCommChannel,
} from '../pane-options-model';
import { useGrid, useServices, useSettings } from '../kit/hooks';
import { centreLeft } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { Blank, CheckCell, Line, type MenuItem, MenuRows, Page } from '../kit/widgets';

const LABEL_W = 10;
/** `[X]███ ` + label. */
const ROW_W = 7 + LABEL_W;

export function CommOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const { cols } = useGrid();
  const n = COMM_CHANNEL_ORDER.length;
  // Rows 0..n-1: channels; n: NPCs; n+1: the chat window; n+2: Back.
  const NPC = n;
  const WIN = n + 1;
  const ROWS = n + 3;
  const [row, setRow] = useState(0);
  const rows = commChannelRows(s.comm.filters);

  const toggleChannel = (name: string): void => toggleCommChannel(settings, name);
  const toggleNpcs = (): void => setCommNpcs(settings, !s.comm.npcs);
  const stepWindow = (): void => setChatWindow(settings, nextChatWindow(s.comm.chatWindow));
  const windowLabel = COMM_CHAT_WINDOW_CHOICES.find((c) => c.value === String(s.comm.chatWindow))?.label ?? '30 min';
  const windowText = `Chats: active in the last ${windowLabel}`.replace('the last All', 'any time');
  const back: MenuItem[] = [{ key: 'back', label: 'Back', activate: () => nav.pop() }];

  const activate = (r: number): void => {
    if (r < n) toggleChannel(COMM_CHANNEL_ORDER[r]!);
    else if (r === NPC) toggleNpcs();
    else if (r === WIN) stepWindow();
    else nav.pop();
  };

  useKeys((_e, nk) => {
    switch (nk) {
      case 'up':
      case 'backtab':
        setRow((row + ROWS - 1) % ROWS);
        return true;
      case 'down':
      case 'tab':
        setRow((row + 1) % ROWS);
        return true;
      case 'home':
        setRow(0);
        return true;
      case 'end':
        setRow(ROWS - 1);
        return true;
      case 'activate':
        activate(row);
        return true;
    }
    return false;
  });

  const at = centreLeft(cols, Math.max(ROW_W, 'Chats: active in the last 30 min'.length));
  return (
    <Page title="Communication" footer={['↑↓ Navigate', 'Enter Toggle', 'ESC Back']}>
      <Line at={at}>
        <span class="wc-c-hint">Public shows</span>
      </Line>
      {rows.map(({ name, label, color, on }, r) => {
        return (
          <Line at={at} class="wc-grid-row">
            <CheckCell
              checked={on}
              cursor={row === r}
              swatch={on ? color : 'var(--c-off)'}
              title={`${label} in Public: ${on ? 'on' : 'off'}`}
              onHover={() => setRow(r)}
              onClick={() => {
                setRow(r);
                toggleChannel(name);
              }}
            />{' '}
            <span
              class={row === r ? 'wc-c-active' : on ? 'wc-c-item' : 'wc-c-off'}
              data-channel={name}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setRow(r)}
              onClick={() => {
                setRow(r);
                toggleChannel(name);
              }}
            >
              {label}
            </span>
          </Line>
        );
      })}
      <Line at={at} class="wc-grid-row">
        <CheckCell
          checked={s.comm.npcs}
          cursor={row === NPC}
          swatch=""
          title={`NPCs in Public: ${s.comm.npcs ? 'on' : 'off'}`}
          onHover={() => setRow(NPC)}
          onClick={() => {
            setRow(NPC);
            toggleNpcs();
          }}
        />{' '}
        <span
          class={row === NPC ? 'wc-c-active' : s.comm.npcs ? 'wc-c-item' : 'wc-c-off'}
          data-key="npcs"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setRow(NPC)}
          onClick={() => {
            setRow(NPC);
            toggleNpcs();
          }}
        >
          NPCs
        </span>
      </Line>
      <Blank />
      <Line at={at} class="wc-grid-row">
        <span
          class={row === WIN ? 'wc-c-active' : 'wc-c-item'}
          data-key="chat-window"
          title="Enter steps 10, 30, 60 min, any time"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setRow(WIN)}
          onClick={() => {
            setRow(WIN);
            stepWindow();
          }}
        >
          {windowText}
        </span>
      </Line>
      <Blank />
      <MenuRows items={back} cursor={row === n + 2 ? 0 : -1} setCursor={() => setRow(n + 2)} hoverMoves />
    </Page>
  );
}
