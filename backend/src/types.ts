export type CrowdLevel = "LOW" | "MEDIUM" | "HIGH";

export interface FrameObservation {
  frame_index: number;
  video_time_seconds: number;
  image_name: string;
  image_width: number;
  image_height: number;
  head_count: number;
  detections: unknown[];
}

/** Full head-video-v1 JSON document emitted by the AI video runner. */
export interface ObservationInput {
  schema_version: "head-video-v1";
  input_type: "recorded_video";
  video_name: string;
  model_file: string;
  coordinate_format: "xyxy_pixels";
  confidence_threshold: number;
  sample_interval_seconds: number;
  timestamp_source: "decoder_relative_to_first_frame";
  reported_fps: number | null;
  reported_frame_count: number | null;
  decoded_frame_count: number;
  analyzed_frame_count: number;
  last_decoded_video_time_seconds: number;
  decode_check: "frame_count_matched" | "end_not_verified_by_frame_count";
  analyzed_at: string;
  images: FrameObservation[];
}

export interface SubscriptionInput {
  facility_id: string;
  fcm_token: string;
}
