// What a scene script gives the recorder (record/scenes/*.ts).
import type { Page } from '@playwright/test';
import type { PageOptions } from './browser.ts';
import type { FrameClock } from './frame-clock.ts';
import type { Marks } from './timeline.ts';

export interface SceneRun {
  page: Page;
  marks: Marks;
  /** A stepped take's clock (Scene.stepped): its `until` and `sleep` are film time. */
  clock?: FrameClock;
}

export interface Scene {
  /** The capture mode (record/lib/browser.ts MODES) unless `--mode` says otherwise; default DEFAULT_MODE. */
  mode?: string;
  /** The page's date and MUME's clock (film scenes: FILM_PAGE). */
  page?: PageOptions;
  /** The page changes size during the take: the recording is this big (CSS px), each frame at its top left. */
  canvas?: { width: number; height: number };
  /**
   * Frame-stepped instead of screencast (frame-clock.ts): setup in real time, then time stands still
   * between frames. `workers`: how many must follow the clock; `x`: the page's left edge in the 1920 × 1080 frame.
   */
  stepped?: { workers: number; x: number };
  /** Before the camera rolls: log in, pin the weather, lay out the panes. */
  setup(page: Page): Promise<SceneState>;
  /** On camera. Set markers with `marks`; `active` brackets the stretch the fps stats are judged on. */
  run(r: SceneRun, state: SceneState): Promise<void>;
}

/** Whatever setup hands to run (the mocked socket, …). */
export type SceneState = Record<string, unknown>;
