// Public surface of the profiles module (ADR 0010 "Profiles").
export * from './names';
export { BUNDLED_PROFILES, PROFILE_TEMPLATE, ProfileError, type ProfileRecord, ProfileStore, compareNames } from './store';
export { downloadProfile } from './download';
export { type CommitOptions, type CommitProfile, type CommitResult, commitStored } from './commit';
