// The editor chunk: the profile editor (ADR 0015 "Editor host", P3 notes)
// and the script editor (ADR 0051 "P2"). Loaded with
// a dynamic import from the chrome's Profile frame (EDIT) and the ESC
// menu's Profile row, and prefetched when idle once the start page is up;
// it carries CodeMirror, so it never sits on the cold-start path.
//
//   const { openProfileEditor } = await import('../../editor');
//   openProfileEditor(nav, { name, text, isLive, save, apply });

import './editor.css';

export { type ApplyResult, type EditorHost, ProfileEditor, openProfileEditor } from './frame';
export { type ScriptEditorHost, ScriptEditor, openScriptEditor } from './script-frame';
export { ScriptManual, openScriptManual } from './script-manual-frame';
