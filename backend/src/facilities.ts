import { json } from "./http";

const latestAnalysisSelect = `
  SELECT a.analysis_id, a.schema_version, a.input_type, a.video_name,
         a.sample_interval_seconds, a.analyzed_frame_count, a.decode_check, a.analyzed_at,
         (SELECT h.head_count FROM head_observations h
           WHERE h.analysis_id = a.analysis_id ORDER BY h.frame_index DESC LIMIT 1) AS latest_head_count,
         (SELECT h.video_time_seconds FROM head_observations h
           WHERE h.analysis_id = a.analysis_id ORDER BY h.frame_index DESC LIMIT 1) AS latest_video_time_seconds
    FROM analysis_runs a
   WHERE a.facility_id = ? AND a.ingest_status = 'complete'
   ORDER BY a.analyzed_at DESC LIMIT 1
`;

export async function listFacilities(env: Env): Promise<Response> {
  const facilities = await env.DB.prepare(`
    SELECT f.id, f.name, f.building, f.location, f.facility_type,
           a.analysis_id, a.video_name, a.input_type, a.sample_interval_seconds,
           a.analyzed_frame_count, a.decode_check, a.analyzed_at,
           (SELECT h.head_count FROM head_observations h
             WHERE h.analysis_id = a.analysis_id ORDER BY h.frame_index DESC LIMIT 1) AS latest_head_count,
           (SELECT h.video_time_seconds FROM head_observations h
             WHERE h.analysis_id = a.analysis_id ORDER BY h.frame_index DESC LIMIT 1) AS latest_video_time_seconds
      FROM facilities f
      LEFT JOIN analysis_runs a ON a.analysis_id = (
        SELECT analysis_id FROM analysis_runs
         WHERE facility_id = f.id AND ingest_status = 'complete'
         ORDER BY analyzed_at DESC LIMIT 1
      )
     WHERE f.is_active = 1
     ORDER BY f.building, f.name
  `).all<Record<string, unknown>>();
  return json({ facilities: facilities.results ?? [] });
}

export async function getFacility(env: Env, id: string): Promise<Response> {
  const facility = await env.DB.prepare(`
    SELECT id, name, building, location, facility_type
      FROM facilities WHERE id = ? AND is_active = 1
  `).bind(id).first<Record<string, unknown>>();
  if (!facility) return json({ error: "facility_not_found" }, 404);
  const latestAnalysis = await env.DB.prepare(latestAnalysisSelect)
    .bind(id).first<Record<string, unknown>>();
  return json({ facility, latest_analysis: latestAnalysis ?? null });
}

export async function getHeadObservations(request: Request, env: Env, id: string): Promise<Response> {
  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(id).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);

  const requestedAnalysisId = new URL(request.url).searchParams.get("analysis_id");
  const analysis = requestedAnalysisId
    ? await env.DB.prepare(`
        SELECT analysis_id, video_name, input_type, sample_interval_seconds, analyzed_frame_count,
               decode_check, analyzed_at
          FROM analysis_runs
         WHERE analysis_id = ? AND facility_id = ? AND ingest_status = 'complete'
      `).bind(requestedAnalysisId, id).first<Record<string, unknown>>()
    : await env.DB.prepare(`
        SELECT analysis_id, video_name, input_type, sample_interval_seconds, analyzed_frame_count,
               decode_check, analyzed_at
          FROM analysis_runs
         WHERE facility_id = ? AND ingest_status = 'complete'
         ORDER BY analyzed_at DESC LIMIT 1
      `).bind(id).first<Record<string, unknown>>();
  if (!analysis) return json({ facility_id: id, analysis: null, observations: [] });

  const observations = await env.DB.prepare(`
    SELECT frame_index, video_time_seconds, image_name, image_width, image_height, head_count
      FROM head_observations WHERE analysis_id = ? ORDER BY frame_index
  `).bind(analysis.analysis_id).all<Record<string, unknown>>();
  return json({ facility_id: id, analysis, observations: observations.results ?? [] });
}
