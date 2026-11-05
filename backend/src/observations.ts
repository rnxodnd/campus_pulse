import { notifySubscribers } from "./fcm";
import { json, readJson } from "./http";
import type { AnalysisStatus, CrowdLevel } from "./types";
import { isStale, validateObservation } from "./validation";

export async function ingest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const input = validateObservation(body);
  if (!input) return json({ error: "invalid_observation" }, 400);
  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(input.facility_id).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);
  if (input.analysis_status === "OK" && isStale(input.captured_at)) {
    return json({ error: "captured_at_out_of_range" }, 400);
  }
  const previous = await env.DB.prepare(`
    SELECT captured_at, crowd_level, analysis_status
      FROM observations WHERE facility_id = ? ORDER BY captured_at DESC LIMIT 1
  `).bind(input.facility_id).first<{ captured_at: string; crowd_level: CrowdLevel; analysis_status: AnalysisStatus }>();
  if (previous && Date.parse(input.captured_at) <= Date.parse(previous.captured_at)) {
    return json({ error: "observation_not_newer_than_latest" }, 409);
  }
  const status = input.analysis_status;
  await env.DB.prepare(`
    INSERT INTO observations (
      facility_id, captured_at, total_seats, available_seats, belongings_seats,
      occupied_seats, unknown_seats, seated_people, queue_people, crowd_level, analysis_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(input.facility_id, input.captured_at, input.total_seats, input.available_seats,
    input.belongings_seats, input.occupied_seats, input.unknown_seats, input.seated_people,
    input.queue_people,
    input.crowd_level, status).run();
  if (status === "OK" && previous?.analysis_status === "OK" && previous.crowd_level === "HIGH" &&
      (input.crowd_level === "MEDIUM" || input.crowd_level === "LOW")) {
    ctx.waitUntil(notifySubscribers(env, input.facility_id, input.crowd_level));
  }
  return json({ accepted: true, crowd_level: input.crowd_level, analysis_status: status }, 201);
}
