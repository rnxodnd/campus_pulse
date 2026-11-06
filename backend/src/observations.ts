import { json, readJson } from "./http";
import { crowdLevelForHeadCount } from "./crowd";
import { notifySubscribers } from "./push";
import type { CompactObservationInput, ObservationInput } from "./types";
import { validateCompactObservation, validateObservation } from "./validation";

const FACILITY_ID = "eng5_cafeteria";
const FRAME_INSERT_BATCH_SIZE = 50;

async function createAnalysisId(input: unknown): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function latestHeadCount(env: Env, facilityId: string): Promise<{ head_count: number; analyzed_at: string } | null> {
  return env.DB.prepare(`
    SELECT head_count, analyzed_at FROM (
      SELECT h.head_count AS head_count, a.analyzed_at AS analyzed_at, h.video_time_seconds AS video_time_seconds
        FROM analysis_runs a
        JOIN head_observations h ON h.analysis_id = a.analysis_id
       WHERE a.facility_id = ? AND a.ingest_status = 'complete'
         AND h.frame_index = (SELECT MAX(h2.frame_index) FROM head_observations h2 WHERE h2.analysis_id = a.analysis_id)
      UNION ALL
      SELECT h.head_count AS head_count, r.analyzed_at AS analyzed_at, h.video_time_seconds AS video_time_seconds
        FROM head_count_runs r
        JOIN head_count_observations h ON h.run_id = r.run_id
       WHERE r.facility_id = ? AND r.ingest_status = 'complete'
         AND h.observation_index = (SELECT MAX(h2.observation_index) FROM head_count_observations h2 WHERE h2.run_id = r.run_id)
    ) ORDER BY analyzed_at DESC, video_time_seconds DESC LIMIT 1
  `).bind(facilityId, facilityId).first<{ head_count: number; analyzed_at: string }>();
}

async function ingestCompactObservation(input: CompactObservationInput, env: Env): Promise<Response> {
  const facilityId = input.facility_id ?? FACILITY_ID;
  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(facilityId).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);

  const analyzedAt = input.analyzed_at
    ? new Date(input.analyzed_at).toISOString()
    : new Date().toISOString();
  const runId = await createAnalysisId({
    facility_id: facilityId,
    source_analysis_id: input.source_analysis_id ?? null,
    analyzed_at: analyzedAt,
    observations: input.observations,
  });
  const existing = await env.DB.prepare("SELECT ingest_status FROM head_count_runs WHERE run_id = ?")
    .bind(runId).first<{ ingest_status: "processing" | "complete" }>();
  if (existing?.ingest_status === "complete") {
    return json({ accepted: true, duplicate: true, analysis_id: runId, frame_count: input.observations.length });
  }

  const previous = await latestHeadCount(env, facilityId);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO head_count_runs (run_id, facility_id, analyzed_at, observation_count, ingest_status)
    VALUES (?, ?, ?, ?, 'processing')
  `).bind(runId, facilityId, analyzedAt, input.observations.length).run();

  for (let offset = 0; offset < input.observations.length; offset += FRAME_INSERT_BATCH_SIZE) {
    const statements = input.observations.slice(offset, offset + FRAME_INSERT_BATCH_SIZE).map((observation) =>
      env.DB.prepare(`
        INSERT OR IGNORE INTO head_count_observations (run_id, observation_index, video_time_seconds, head_count)
        VALUES (?, ?, ?, ?)
      `).bind(runId, observation.frame_index, observation.video_time_seconds, observation.head_count),
    );
    await env.DB.batch(statements);
  }

  const saved = await env.DB.prepare(
    "SELECT COUNT(*) AS observation_count FROM head_count_observations WHERE run_id = ?",
  ).bind(runId).first<{ observation_count: number }>();
  if (saved?.observation_count !== input.observations.length) {
    return json({ error: "incomplete_observation_storage", analysis_id: runId }, 500);
  }
  await env.DB.prepare("UPDATE head_count_runs SET ingest_status = 'complete' WHERE run_id = ?")
    .bind(runId).run();

  const latest = input.observations[input.observations.length - 1];
  const crowdLevel = crowdLevelForHeadCount(latest.head_count);
  if (previous && Date.parse(analyzedAt) >= Date.parse(previous.analyzed_at)) {
    await notifySubscribers(
      env,
      facilityId,
      crowdLevelForHeadCount(previous.head_count),
      crowdLevel,
      latest.head_count,
      runId,
    );
  }

  return json({
    accepted: true,
    analysis_id: runId,
    facility_id: facilityId,
    frame_count: input.observations.length,
    latest_head_count: latest.head_count,
    crowd_level: crowdLevel,
    analyzed_at: analyzedAt,
  }, 201);
}

export async function ingest(request: Request, env: Env): Promise<Response> {
  if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const input = validateObservation(body);
  if (!input) {
    const compactInput = validateCompactObservation(body);
    if (!compactInput) return json({ error: "invalid_observation_document" }, 400);
    return ingestCompactObservation(compactInput, env);
  }

  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(FACILITY_ID).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);

  const analysisId = await createAnalysisId(input);
  const existing = await env.DB.prepare("SELECT ingest_status FROM analysis_runs WHERE analysis_id = ?")
    .bind(analysisId).first<{ ingest_status: "processing" | "complete" }>();
  if (existing?.ingest_status === "complete") {
    return json({ accepted: true, duplicate: true, analysis_id: analysisId, frame_count: input.images.length });
  }

  const previous = await latestHeadCount(env, FACILITY_ID);

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

  const latestFrame = input.images[input.images.length - 1];
  const crowdLevel = crowdLevelForHeadCount(latestFrame.head_count);
  if (previous && Date.parse(input.analyzed_at) >= Date.parse(previous.analyzed_at)) {
    await notifySubscribers(
      env,
      FACILITY_ID,
      crowdLevelForHeadCount(previous.head_count),
      crowdLevel,
      latestFrame.head_count,
      analysisId,
    );
  }

  return json({
    accepted: true,
    analysis_id: analysisId,
    facility_id: FACILITY_ID,
    frame_count: input.images.length,
    latest_head_count: latestFrame.head_count,
    crowd_level: crowdLevel,
  }, 201);
}
