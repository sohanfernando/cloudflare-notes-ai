-- Local development only: stands in for Vectorize, which has no local emulator.
-- Not applied to the production database.

CREATE TABLE IF NOT EXISTS local_vectors (
  chunk_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  embedding TEXT NOT NULL -- JSON array of numbers
);
CREATE INDEX IF NOT EXISTS idx_local_vectors_user ON local_vectors(user_id);
