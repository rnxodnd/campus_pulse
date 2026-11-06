ALTER TABLE push_subscriptions RENAME COLUMN fcm_token TO push_token;
ALTER TABLE push_subscriptions
  ADD COLUMN notify_on_medium INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_medium IN (0, 1));
ALTER TABLE push_subscriptions
  ADD COLUMN notify_on_low INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_low IN (0, 1));

CREATE TABLE notification_history (
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  analysis_id TEXT NOT NULL REFERENCES analysis_runs(analysis_id) ON DELETE CASCADE,
  previous_level TEXT NOT NULL CHECK (previous_level IN ('LOW', 'MEDIUM', 'HIGH')),
  crowd_level TEXT NOT NULL CHECK (crowd_level IN ('LOW', 'MEDIUM', 'HIGH')),
  head_count INTEGER NOT NULL CHECK (head_count >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (analysis_id, push_token)
);

CREATE INDEX idx_notification_history_token_created
  ON notification_history (facility_id, push_token, created_at DESC);
