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
