import type { ObservationInput, SubscriptionInput } from "./types";

export function validateObservation(value: unknown): ObservationInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.schema_version !== "head-video-v1" || input.input_type !== "recorded_video") return null;
  if (typeof input.video_name !== "string" || !input.video_name.trim() || input.video_name.length > 255) return null;
  if (typeof input.model_file !== "string" || !input.model_file.trim() || input.model_file.length > 4096) return null;
  if (input.coordinate_format !== "xyxy_pixels" || input.timestamp_source !== "decoder_relative_to_first_frame") return null;
  if (typeof input.analyzed_at !== "string" || !Number.isFinite(Date.parse(input.analyzed_at))) return null;
  if (typeof input.sample_interval_seconds !== "number" || !Number.isFinite(input.sample_interval_seconds) || input.sample_interval_seconds <= 0) return null;
  if (typeof input.confidence_threshold !== "number" || !Number.isFinite(input.confidence_threshold) ||
      input.confidence_threshold < 0 || input.confidence_threshold > 1) return null;
  if (input.reported_fps !== null && (typeof input.reported_fps !== "number" || !Number.isFinite(input.reported_fps) || input.reported_fps <= 0)) return null;
  if (input.reported_frame_count !== null && (!Number.isInteger(input.reported_frame_count) || (input.reported_frame_count as number) <= 0)) return null;
  if (!Number.isInteger(input.decoded_frame_count) || (input.decoded_frame_count as number) <= 0) return null;
  if (!Number.isInteger(input.analyzed_frame_count) || (input.analyzed_frame_count as number) <= 0) return null;
  if (!Number.isFinite(input.last_decoded_video_time_seconds) || (input.last_decoded_video_time_seconds as number) < 0) return null;
  if (![
    "frame_count_matched",
    "end_not_verified_by_frame_count",
  ].includes(String(input.decode_check))) return null;
  const frameCountMatches = input.reported_frame_count !== null && input.reported_frame_count === input.decoded_frame_count;
  if ((input.decode_check === "frame_count_matched") !== frameCountMatches) return null;
  if (!Array.isArray(input.images) || input.images.length === 0 || input.images.length !== input.analyzed_frame_count || input.images.length > 5000) return null;

  let previousFrameIndex = -1;
  let previousVideoTime = -1;
  for (const rawFrame of input.images) {
    if (!rawFrame || typeof rawFrame !== "object") return null;
    const frame = rawFrame as Record<string, unknown>;
    if (!Number.isInteger(frame.frame_index) || (frame.frame_index as number) < 0 || (frame.frame_index as number) <= previousFrameIndex) return null;
    if ((frame.frame_index as number) >= (input.decoded_frame_count as number)) return null;
    if (typeof frame.video_time_seconds !== "number" || !Number.isFinite(frame.video_time_seconds) ||
        frame.video_time_seconds < 0 || frame.video_time_seconds <= previousVideoTime) return null;
    if (typeof frame.image_name !== "string" || !frame.image_name.trim() || frame.image_name.length > 512) return null;
    if (!Number.isInteger(frame.image_width) || (frame.image_width as number) <= 0 ||
        !Number.isInteger(frame.image_height) || (frame.image_height as number) <= 0) return null;
    if (!Number.isInteger(frame.head_count) || (frame.head_count as number) < 0 || !Array.isArray(frame.detections) ||
        frame.detections.length !== frame.head_count) return null;
    previousFrameIndex = frame.frame_index as number;
    previousVideoTime = frame.video_time_seconds;
  }
  if ((input.last_decoded_video_time_seconds as number) < previousVideoTime) return null;
  return input as unknown as ObservationInput;
}

export function validateSubscription(value: unknown): SubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.facility_id !== "string" || !input.facility_id.trim() ||
      typeof input.fcm_token !== "string" || !input.fcm_token.trim() || input.fcm_token.length > 4096) return null;
  return { facility_id: input.facility_id, fcm_token: input.fcm_token };
}
