// What a scene script gives the recorder (record/scenes/*.ts).
import type { Page } from '@playwright/test';
import type { Marks } from './timeline.ts';

export interface SceneRun {
  page: Page;
  marks: Marks;
}

export interface Scene {
  /** Before the camera rolls: log in, pin the weather, lay out the panes. */
  setup(page: Page): Promise<SceneState>;
  /** On camera. Set markers with `marks`; `active` brackets the stretch the fps stats are judged on. */
  run(r: SceneRun, state: SceneState): Promise<void>;
}

/** Whatever setup hands to run (the mocked socket, …). */
export type SceneState = Record<string, unknown>;
