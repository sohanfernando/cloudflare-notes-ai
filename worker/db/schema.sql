-- D1 schema. Every row carries user_id so each query can be scoped to one user.

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON chunks(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

-- Questions the user's notes could not answer: one row per distinct question.
CREATE TABLE IF NOT EXISTS gaps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  question_key TEXT NOT NULL,          -- normalised question, so repeats are counted, not duplicated
  embedding BLOB NOT NULL,             -- the question's embedding as float32 bytes
  best_score REAL NOT NULL,            -- best match the notes offered when it went unanswered
  note_id TEXT,                        -- note the question was limited to, if any
  suggested_note_id TEXT,              -- note added later that may answer it
  ask_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_asked_at INTEGER NOT NULL,
  UNIQUE (user_id, question_key)
);
CREATE INDEX IF NOT EXISTS idx_gaps_user ON gaps(user_id);
