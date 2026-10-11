/**
 * Schema migrations (docs/DECISIONS.md D4). Two kinds of database:
 *
 * - `app.db`: the accounts list and app settings.
 * - `account-<id>.db`: one per account, so removing an account removes its
 *   whole cache. Lists are replaced on every sync; favorites, history, resume
 *   points and hidden categories are keyed by id and survive refreshes.
 *
 * Each migration is a list of statements, applied in one transaction together
 * with `PRAGMA user_version`. Never edit a shipped migration: add a new one.
 */

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const appMigrations: Migration[] = [
  {
    version: 1,
    name: "accounts and settings",
    statements: [
      `CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        server TEXT NOT NULL,
        username TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        status TEXT,
        expires_at INTEGER,
        max_connections INTEGER,
        allowed_formats TEXT NOT NULL DEFAULT '[]',
        timezone TEXT,
        last_sync_at INTEGER
      )`,
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
];

export const accountMigrations: Migration[] = [
  {
    version: 1,
    name: "library, personal data and caches",
    statements: [
      // --- lists, replaced by each sync -----------------------------------------
      `CREATE TABLE categories (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_id INTEGER,
        position INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      )`,
      `CREATE TABLE live (
        id INTEGER PRIMARY KEY,
        num INTEGER,
        name TEXT NOT NULL,
        icon TEXT,
        epg_channel_id TEXT,
        added_at INTEGER,
        tv_archive INTEGER NOT NULL DEFAULT 0,
        tv_archive_days INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL
      )`,
      `CREATE INDEX live_by_name ON live (name COLLATE NOCASE)`,
      `CREATE TABLE vod (
        id INTEGER PRIMARY KEY,
        num INTEGER,
        name TEXT NOT NULL,
        icon TEXT,
        rating REAL,
        added_at INTEGER,
        ext TEXT NOT NULL,
        position INTEGER NOT NULL
      )`,
      `CREATE INDEX vod_by_name ON vod (name COLLATE NOCASE)`,
      `CREATE INDEX vod_by_added ON vod (added_at DESC)`,
      `CREATE TABLE series (
        id INTEGER PRIMARY KEY,
        num INTEGER,
        name TEXT NOT NULL,
        cover TEXT,
        plot TEXT,
        cast_names TEXT,
        director TEXT,
        genre TEXT,
        release_date TEXT,
        last_modified_at INTEGER,
        rating REAL,
        backdrop TEXT,
        episode_run_time INTEGER,
        position INTEGER NOT NULL
      )`,
      `CREATE INDEX series_by_name ON series (name COLLATE NOCASE)`,
      `CREATE INDEX series_by_modified ON series (last_modified_at DESC)`,
      // Providers list one item in several categories (never twice in one), so
      // membership is its own table: one row per (category, item).
      `CREATE TABLE category_items (
        kind TEXT NOT NULL,
        category_id TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (kind, category_id, item_id)
      )`,
      `CREATE INDEX category_items_by_position ON category_items (kind, category_id, position)`,
      `CREATE INDEX category_items_by_item ON category_items (kind, item_id)`,
      // When each list was last synced, and how many items it had.
      `CREATE TABLE sync_state (
        list TEXT PRIMARY KEY,
        synced_at INTEGER NOT NULL,
        count INTEGER NOT NULL,
        skipped INTEGER NOT NULL DEFAULT 0
      )`,

      // --- detail caches (SPEC "Data and sync") ---------------------------------
      `CREATE TABLE episodes (
        id INTEGER PRIMARY KEY,
        series_id INTEGER NOT NULL,
        season INTEGER,
        episode_num INTEGER,
        title TEXT,
        ext TEXT NOT NULL,
        duration_secs INTEGER,
        image TEXT,
        plot TEXT,
        rating REAL,
        release_date TEXT
      )`,
      `CREATE INDEX episodes_by_series ON episodes (series_id, season, episode_num)`,
      `CREATE TABLE details_cache (
        kind TEXT NOT NULL,
        id INTEGER NOT NULL,
        json TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      )`,
      `CREATE TABLE epg_cache (
        stream_id INTEGER PRIMARY KEY,
        json TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      )`,

      // --- personal data, survives every refresh ---------------------------------
      `CREATE TABLE favorites (
        kind TEXT NOT NULL,
        id INTEGER NOT NULL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      )`,
      `CREATE TABLE hidden_categories (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        PRIMARY KEY (kind, id)
      )`,
      `CREATE TABLE history (
        kind TEXT NOT NULL,
        id INTEGER NOT NULL,
        watched_at INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      )`,
      `CREATE INDEX history_by_time ON history (watched_at DESC)`,
      `CREATE TABLE resume (
        kind TEXT NOT NULL,
        id INTEGER NOT NULL,
        position_secs REAL NOT NULL,
        duration_secs REAL,
        watched INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      )`,
      `CREATE INDEX resume_by_time ON resume (updated_at DESC)`,
      // Per-account preferences, e.g. remembered audio/subtitle tracks (M3).
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
];
