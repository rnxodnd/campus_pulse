CREATE TABLE IF NOT EXISTS analysis_runs (
  analysis_id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  schema_version TEXT NOT NULL CHECK (schema_version = 'head-video-v1'),
  input_type TEXT NOT NULL CHECK (input_type = 'recorded_video'),
  video_name TEXT NOT NULL,
  sample_interval_seconds REAL NOT NULL CHECK (sample_interval_seconds > 0),
  timestamp_source TEXT NOT NULL CHECK (timestamp_source = 'decoder_relative_to_first_frame'),
  reported_fps REAL CHECK (reported_fps IS NULL OR reported_fps > 0),
  reported_frame_count INTEGER CHECK (reported_frame_count IS NULL OR reported_frame_count > 0),
  decoded_frame_count INTEGER NOT NULL CHECK (decoded_frame_count > 0),
  analyzed_frame_count INTEGER NOT NULL CHECK (analyzed_frame_count > 0),
  last_decoded_video_time_seconds REAL NOT NULL CHECK (last_decoded_video_time_seconds >= 0),
  decode_check TEXT NOT NULL CHECK (decode_check IN ('frame_count_matched', 'end_not_verified_by_frame_count')),
  analyzed_at TEXT NOT NULL,
  ingest_status TEXT NOT NULL DEFAULT 'processing' CHECK (ingest_status IN ('processing', 'complete')),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_facility_analyzed
  ON analysis_runs (facility_id, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS head_observations (
  analysis_id TEXT NOT NULL REFERENCES analysis_runs(analysis_id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL CHECK (frame_index >= 0),
  video_time_seconds REAL NOT NULL CHECK (video_time_seconds >= 0),
  image_name TEXT NOT NULL,
  image_width INTEGER NOT NULL CHECK (image_width > 0),
  image_height INTEGER NOT NULL CHECK (image_height > 0),
  head_count INTEGER NOT NULL CHECK (head_count >= 0),
  PRIMARY KEY (analysis_id, frame_index)
);

CREATE INDEX IF NOT EXISTS idx_head_observations_analysis_time
  ON head_observations (analysis_id, video_time_seconds);
