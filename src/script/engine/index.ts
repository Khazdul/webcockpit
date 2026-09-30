// Public surface of the script engine (ADR 0015).
export { ALIAS_DEPTH, BUDGET, EVENT_NAMES, type EngineOptions, type LoadResult, type PersistKind, REPEAT_MAX, SHOW_DEPTH, ScriptEngine, type TypedChange } from './engine';
export { type Colored, type HighlightStyle, type Style, parseColored, parseHighlight } from './color';
export { ExprError, evalCondition, evalMath } from './expr';
export { formatString } from './format';
export { type CompiledPattern, PatternError, compilePattern, matchPattern } from './pattern';
export { DEFAULT_PRIORITY, DefineError, type ListKind, type MatchContext, type Rule, RuleStore, type Timer } from './store';
export { FakeScheduler, type Scheduler, realScheduler } from './timers';
export { escapeVars, expandArgs, expandVars, finishText, splitCommands, splitWords } from './text';
