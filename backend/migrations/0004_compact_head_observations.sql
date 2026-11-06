CREATE TABLE head_count_runs (
  run_id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  analyzed_at TEXT NOT NULL,
  observation_count INTEGER NOT NULL CHECK (observation_count > 0),
  ingest_status TEXT NOT NULL DEFAULT 'processing' CHECK (ingest_status IN ('processing', 'complete')),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_head_count_runs_facility_analyzed
  ON head_count_runs (facility_id, analyzed_at DESC);

CREATE TABLE head_count_observations (
  run_id TEXT NOT NULL REFERENCES head_count_runs(run_id) ON DELETE CASCADE,
  observation_index INTEGER NOT NULL CHECK (observation_index >= 0),
  video_time_seconds REAL NOT NULL CHECK (video_time_seconds >= 0),
  head_count INTEGER NOT NULL CHECK (head_count >= 0),
  PRIMARY KEY (run_id, observation_index)
);

CREATE INDEX idx_head_count_observations_run_time
  ON head_count_observations (run_id, video_time_seconds);

-- Notification history must be able to refer to runs from either input schema.
DROP INDEX IF EXISTS idx_notification_history_token_created;
ALTER TABLE notification_history RENAME TO notification_history_v3;

CREATE TABLE notification_history (
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  previous_level TEXT NOT NULL CHECK (previous_level IN ('LOW', 'MEDIUM', 'HIGH')),
  crowd_level TEXT NOT NULL CHECK (crowd_level IN ('LOW', 'MEDIUM', 'HIGH')),
  head_count INTEGER NOT NULL CHECK (head_count >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (analysis_id, push_token)
);

INSERT INTO notification_history (
  facility_id, push_token, analysis_id, previous_level, crowd_level, head_count, created_at
)
SELECT facility_id, push_token, analysis_id, previous_level, crowd_level, head_count, created_at
  FROM notification_history_v3;

DROP TABLE notification_history_v3;

CREATE INDEX idx_notification_history_token_created
  ON notification_history (facility_id, push_token, created_at DESC);
