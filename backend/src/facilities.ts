import { json } from "./http";
import { isStale } from "./validation";

export async function listFacilities(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT f.id, f.name, f.building, f.location, f.facility_type,
           o.captured_at, o.total_seats, o.available_seats, o.belongings_seats,
           o.occupied_seats, o.unknown_seats, o.seated_people, o.queue_people,
           o.crowd_level, o.analysis_status
      FROM facilities f
      LEFT JOIN observations o ON o.id = (
        SELECT id FROM observations WHERE facility_id = f.id ORDER BY captured_at DESC LIMIT 1
      )
     WHERE f.is_active = 1
     ORDER BY f.building, f.name
  `).all<Record<string, unknown>>();
  const now = Date.now();
  const facilities = (result.results ?? []).map((item) => {
    return { ...item, data_status: getDataStatus(item.captured_at, item.analysis_status) };
  });
  return json({ facilities, as_of: new Date(now).toISOString() });
}

export async function getFacility(env: Env, id: string): Promise<Response> {
  const facility = await env.DB.prepare(`
    SELECT id, name, building, location, facility_type
      FROM facilities WHERE id = ? AND is_active = 1
  `).bind(id).first<Record<string, unknown>>();
  if (!facility) return json({ error: "facility_not_found" }, 404);
  const observation = await env.DB.prepare(`
    SELECT captured_at, total_seats, available_seats, belongings_seats,
           occupied_seats, unknown_seats, seated_people, queue_people,
           crowd_level, analysis_status
      FROM observations WHERE facility_id = ? ORDER BY captured_at DESC LIMIT 1
  `).bind(id).first<Record<string, unknown>>();
  return json({
    facility,
    observation: observation ? {
      ...observation,
      data_status: getDataStatus(observation.captured_at, observation.analysis_status),
    } : null,
  });
}

function getDataStatus(capturedAt: unknown, analysisStatus: unknown): "current" | "delayed" | "error" | "unknown" {
  if (capturedAt === null || capturedAt === undefined) return "unknown";
  if (analysisStatus === "ERROR") return "error";
  if (analysisStatus === "DELAYED" || typeof capturedAt !== "string" || isStale(capturedAt)) return "delayed";
  return analysisStatus === "OK" ? "current" : "unknown";
}
