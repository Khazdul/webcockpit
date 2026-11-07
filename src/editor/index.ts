// The editor chunk: the profile editor (ADR 0015 "Editor host", P3 notes;
// the new look, direction B, in ./profile since stage 43a, ADR 0128)
// and the script editor (ADR 0051 "P2"). Loaded with
// a dynamic import from the chrome's Profile frame (EDIT) and the ESC
// menu's Profile row, and prefetched when idle once the start page is up;
// it carries CodeMirror, so it never sits on the cold-start path.
//
//   const { openProfileEditor } = await import('../../editor');
//   openProfileEditor(nav, { name, text, isLive, load, commit, subscribe });

import './editor.css';

export { type EditorHost, ProfileEditor, openProfileEditor } from './profile/editor';
export { type ScriptEditorHost, ScriptEditor, openScriptEditor } from './script-frame';
export { ScriptManual, openScriptManual } from './script-manual-frame';
