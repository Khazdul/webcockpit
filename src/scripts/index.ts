// User scripts (spec §2.10, ADR 0051): the library service, the header
// parser and the bundled scripts. The script host (`./host`) and the Lua
// runtime are separate lazy chunks: import them dynamically.
export { BUNDLED_SCRIPTS, type BundledScript, NEW_USER_SCRIPTS } from './bundled';
export {
  API_VERSION,
  type ParsedHeader,
  type ScriptHeader,
  type SettingDecl,
  type SettingType,
  type SettingValue,
  apiProblem,
  convertSetting,
  parseHeader,
  withHeaderName,
} from './header';
export {
  SCRIPT_NAME_MAX,
  type ScriptDataRecord,
  ScriptError,
  type ScriptInfo,
  ScriptLibrary,
  type ScriptLibraryOptions,
  type RestoreResult,
  type ScriptRecord,
  type StoreValue,
  scriptNameError,
  scriptTemplate,
  uniqueScriptName,
} from './library';
