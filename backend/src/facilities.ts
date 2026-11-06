import { json } from "./http";
import { crowdLevelForHeadCount } from "./crowd";

type LatestAnalysis = Record<string, unknown> & {
  facility_id: string;
  analysis_id: string;
  analyzed_at: string;
  latest_head_count: number | null;
  latest_video_time_seconds: number | null;
  source: "video" | "compact";
};

const analysisUnion = `
  SELECT a.facility_id, a.analysis_id, a.schema_version, a.input_type, a.video_name,
         a.sample_interval_seconds, a.analyzed_frame_count, a.decode_check, a.analyzed_at,
         (SELECT h.head_count FROM head_observations h
           WHERE h.analysis_id = a.analysis_id ORDER BY h.frame_index DESC LIMIT 1) AS latest_head_count,
         (SELECT h.video_time_seconds FROM head_observations h
           WHERE h.analysis_id = a.analysis_id ORDER BY h.frame_index DESC LIMIT 1) AS latest_video_time_seconds,
         'video' AS source
    FROM analysis_runs a
   WHERE a.ingest_status = 'complete'
  UNION ALL
  SELECT r.facility_id, r.run_id AS analysis_id, 'head-count-observations-v1' AS schema_version,
         'observations' AS input_type, NULL AS video_name, NULL AS sample_interval_seconds,
         r.observation_count AS analyzed_frame_count, NULL AS decode_check, r.analyzed_at,
         (SELECT h.head_count FROM head_count_observations h
           WHERE h.run_id = r.run_id ORDER BY h.observation_index DESC LIMIT 1) AS latest_head_count,
         (SELECT h.video_time_seconds FROM head_count_observations h
           WHERE h.run_id = r.run_id ORDER BY h.observation_index DESC LIMIT 1) AS latest_video_time_seconds,
         'compact' AS source
    FROM head_count_runs r
   WHERE r.ingest_status = 'complete'
`;

async function getLatestAnalysis(
  env: Env,
  facilityId: string,
  analysisId?: string,
): Promise<LatestAnalysis | null> {
  const analysisFilter = analysisId ? "AND analysis_id = ?" : "";
  const statement = env.DB.prepare(`
    SELECT * FROM (${analysisUnion})
     WHERE facility_id = ? ${analysisFilter}
     ORDER BY analyzed_at DESC, latest_video_time_seconds DESC LIMIT 1
  `);
  const query = analysisId
    ? statement.bind(facilityId, analysisId)
    : statement.bind(facilityId);
  return query.first<LatestAnalysis>();
}

function withCrowdLevel<T extends Record<string, unknown>>(analysis: T | null): T | null {
  if (!analysis || analysis.latest_head_count === null || analysis.latest_head_count === undefined) return analysis;
  return { ...analysis, crowd_level: crowdLevelForHeadCount(Number(analysis.latest_head_count)) };
}

export async function listFacilities(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT id, name, building, location, facility_type
      FROM facilities WHERE is_active = 1 ORDER BY building, name
  `).all<Record<string, unknown>>();
  const facilities = await Promise.all((result.results ?? []).map(async (facility) => {
    const latest = await getLatestAnalysis(env, String(facility.id));
    const { facility_id: _facilityId, source: _source, ...latestFields } = latest ?? {};
    return {
      ...facility,
      analysis_id: null,
      video_name: null,
      input_type: null,
      sample_interval_seconds: null,
      analyzed_frame_count: null,
      decode_check: null,
      analyzed_at: null,
      latest_head_count: null,
      latest_video_time_seconds: null,
      ...latestFields,
      crowd_level: latest?.latest_head_count === null || latest?.latest_head_count === undefined
        ? null
        : crowdLevelForHeadCount(Number(latest.latest_head_count)),
    };
  }));
  return json({ facilities });
}

export async function getFacility(env: Env, id: string): Promise<Response> {
  const facility = await env.DB.prepare(`
    SELECT id, name, building, location, facility_type
      FROM facilities WHERE id = ? AND is_active = 1
  `).bind(id).first<Record<string, unknown>>();
  if (!facility) return json({ error: "facility_not_found" }, 404);
  const latestAnalysis = await getLatestAnalysis(env, id);
  const { source: _source, ...publicAnalysis } = latestAnalysis ?? { source: "video" as const };
  return json({ facility, latest_analysis: withCrowdLevel(latestAnalysis ? publicAnalysis : null) });
}

export async function getHeadObservations(request: Request, env: Env, id: string): Promise<Response> {
  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(id).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);

  const requestedAnalysisId = new URL(request.url).searchParams.get("analysis_id") ?? undefined;
  const analysis = await getLatestAnalysis(env, id, requestedAnalysisId);
  if (!analysis) return json({ facility_id: id, analysis: null, observations: [] });

  const observations = analysis.source === "compact"
    ? await env.DB.prepare(`
        SELECT observation_index AS frame_index, video_time_seconds, head_count
          FROM head_count_observations WHERE run_id = ? ORDER BY observation_index
      `).bind(analysis.analysis_id).all<Record<string, unknown>>()
    : await env.DB.prepare(`
        SELECT frame_index, video_time_seconds, image_name, image_width, image_height, head_count
          FROM head_observations WHERE analysis_id = ? ORDER BY frame_index
      `).bind(analysis.analysis_id).all<Record<string, unknown>>();

  const { source: _source, ...publicAnalysis } = analysis;
  return json({
    facility_id: id,
    analysis: publicAnalysis,
    observations: (observations.results ?? []).map((frame) => ({
      ...frame,
      crowd_level: crowdLevelForHeadCount(Number(frame.head_count)),
    })),
  });
}
