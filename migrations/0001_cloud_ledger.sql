CREATE TABLE IF NOT EXISTS cloud_ledger (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
