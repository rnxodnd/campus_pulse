import { json, readJson } from "./http";
import type { ObservationInput } from "./types";
import { validateObservation } from "./validation";

const FACILITY_ID = "eng5_cafeteria";
const FRAME_INSERT_BATCH_SIZE = 50;

async function createAnalysisId(input: ObservationInput): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ingest(request: Request, env: Env): Promise<Response> {
  if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const input = validateObservation(body);
  if (!input) return json({ error: "invalid_head_video_document" }, 400);

  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(FACILITY_ID).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);

  const analysisId = await createAnalysisId(input);
  const existing = await env.DB.prepare("SELECT ingest_status FROM analysis_runs WHERE analysis_id = ?")
    .bind(analysisId).first<{ ingest_status: "processing" | "complete" }>();
  if (existing?.ingest_status === "complete") {
    return json({ accepted: true, duplicate: true, analysis_id: analysisId, frame_count: input.images.length });
  }

  await env.DB.prepare(`
    INSERT OR IGNORE INTO analysis_runs (
      analysis_id, facility_id, schema_version, input_type, video_name,
      sample_interval_seconds, timestamp_source, reported_fps, reported_frame_count,
      decoded_frame_count, analyzed_frame_count, last_decoded_video_time_seconds,
      decode_check, analyzed_at, ingest_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')
  `).bind(
    analysisId, FACILITY_ID, input.schema_version, input.input_type, input.video_name,
    input.sample_interval_seconds, input.timestamp_source, input.reported_fps, input.reported_frame_count,
    input.decoded_frame_count, input.analyzed_frame_count, input.last_decoded_video_time_seconds,
    input.decode_check, input.analyzed_at,
  ).run();

  for (let offset = 0; offset < input.images.length; offset += FRAME_INSERT_BATCH_SIZE) {
    const statements = input.images.slice(offset, offset + FRAME_INSERT_BATCH_SIZE).map((frame) =>
      env.DB.prepare(`
        INSERT OR IGNORE INTO head_observations (
          analysis_id, frame_index, video_time_seconds, image_name,
          image_width, image_height, head_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        analysisId, frame.frame_index, frame.video_time_seconds, frame.image_name,
        frame.image_width, frame.image_height, frame.head_count,
      ),
    );
    await env.DB.batch(statements);
  }

  const savedFrames = await env.DB.prepare(
    "SELECT COUNT(*) AS frame_count FROM head_observations WHERE analysis_id = ?",
  ).bind(analysisId).first<{ frame_count: number }>();
  if (savedFrames?.frame_count !== input.images.length) {
    return json({ error: "incomplete_analysis_storage", analysis_id: analysisId }, 500);
  }
  await env.DB.prepare("UPDATE analysis_runs SET ingest_status = 'complete' WHERE analysis_id = ?")
    .bind(analysisId).run();

  return json({
    accepted: true,
    analysis_id: analysisId,
    facility_id: FACILITY_ID,
    frame_count: input.images.length,
  }, 201);
}
