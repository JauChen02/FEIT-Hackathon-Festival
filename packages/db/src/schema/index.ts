/**
 * Every [MVP] table from PLANNING.md §14.2.
 *
 * `admin_audit_log` is tagged [Alpha] and the daily-challenge, scenario,
 * friendship, lobby and V1 tables belong to later stages, so they are not here
 * (§29: do not pre-build later phases).
 */

export * from './enums';
export * from './identity';
export * from './taxonomy';
export * from './content';
export * from './sessions';
export * from './coach';
export * from './points';
export * from './streaks';

/** Table names in dependency order — used by tests and the reset command. */
export const MVP_TABLE_NAMES = [
  'users',
  'user_roles',
  'user_timezone_changes',
  'categories',
  'game_types',
  'game_type_categories',
  'questions',
  'question_versions',
  'content_audit_log',
  'game_sessions',
  'session_players',
  'session_questions',
  'answers',
  'learning_events',
  'skill_profiles',
  'skill_updates',
  'recommendations',
  'point_ledger',
  'streak_days',
  'streak_freezes',
  'streak_summary',
] as const;

/** Postgres enum type names created by this schema. */
export const MVP_ENUM_NAMES = [
  'user_role',
  'category_status',
  'game_mode',
  'game_type_status',
  'content_status',
  'content_origin',
  'question_type',
  'session_status',
  'weakness_tier',
  'team_side',
  'answer_outcome',
  'recommendation_status',
  'ledger_reason',
  'streak_day_source',
  'freeze_status',
] as const;
