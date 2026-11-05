CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  building TEXT NOT NULL,
  location TEXT NOT NULL,
  facility_type TEXT NOT NULL CHECK (facility_type IN ('seating', 'open_space')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  captured_at TEXT NOT NULL,
  total_seats INTEGER,
  available_seats INTEGER,
  belongings_seats INTEGER,
  occupied_seats INTEGER,
  unknown_seats INTEGER,
  seated_people INTEGER,
  queue_people INTEGER,
  crowd_level TEXT CHECK (crowd_level IS NULL OR crowd_level IN ('LOW', 'MEDIUM', 'HIGH')),
  analysis_status TEXT NOT NULL CHECK (analysis_status IN ('OK', 'DELAYED', 'ERROR')),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (analysis_status = 'ERROR' AND total_seats IS NULL AND available_seats IS NULL AND
     belongings_seats IS NULL AND occupied_seats IS NULL AND unknown_seats IS NULL AND seated_people IS NULL AND queue_people IS NULL)
    OR
    (analysis_status <> 'ERROR' AND total_seats = 300 AND available_seats >= 0 AND
     belongings_seats >= 0 AND occupied_seats >= 0 AND unknown_seats >= 0 AND seated_people >= 0 AND
     (queue_people IS NULL OR queue_people >= 0) AND
     total_seats = available_seats + belongings_seats + occupied_seats + unknown_seats)
  ),
  CHECK ((analysis_status = 'ERROR' AND (crowd_level IS NULL OR crowd_level IN ('LOW', 'MEDIUM', 'HIGH'))) OR
         (analysis_status <> 'ERROR' AND crowd_level IN ('LOW', 'MEDIUM', 'HIGH')))
);

CREATE INDEX IF NOT EXISTS idx_observations_facility_captured
  ON observations (facility_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (facility_id, fcm_token)
);

INSERT OR IGNORE INTO facilities (id, name, building, location, facility_type)
VALUES ('eng5_cafeteria', '식당', '5공학관', '식당', 'seating');
