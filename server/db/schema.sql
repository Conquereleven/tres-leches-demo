PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT OR IGNORE INTO schema_migrations VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- Atomic aggregate snapshot plus durable inbox/outbox/command receipts inside the document.
-- All writers must use BEGIN IMMEDIATE; designed for a single-node SQLite deployment.
CREATE TABLE IF NOT EXISTS commerce_state (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL CHECK(json_valid(document)));

-- TL-18: environment identity prevents test/staging database promotion.
CREATE TABLE IF NOT EXISTS runtime_profile (id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL);
INSERT OR IGNORE INTO schema_migrations VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Product Hub V2: uploaded catalog images, content-addressed by SHA-256.
-- Kept beside the aggregate so one transaction and one backup cover both.
CREATE TABLE IF NOT EXISTS product_hub_media (
  sha256 TEXT PRIMARY KEY CHECK(length(sha256)=64),
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_migrations VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
