import { getFacility, getHeadObservations, listFacilities } from "./facilities";
import { json } from "./http";
import { ingest } from "./observations";
import { alertHistory, subscription } from "./subscriptions";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/facilities") return listFacilities(env);
    const observationsMatch = url.pathname.match(/^\/api\/facilities\/([^/]+)\/observations$/);
    if (request.method === "GET" && observationsMatch) {
      return getHeadObservations(request, env, decodeURIComponent(observationsMatch[1]));
    }
    const detailMatch = url.pathname.match(/^\/api\/facilities\/([^/]+)$/);
    if (request.method === "GET" && detailMatch) return getFacility(env, decodeURIComponent(detailMatch[1]));
    if (request.method === "POST" && url.pathname === "/api/observations") return ingest(request, env);
    if (request.method === "POST" && url.pathname === "/api/subscriptions") return subscription(request, env);
    if (request.method === "DELETE" && url.pathname === "/api/subscriptions") return subscription(request, env, true);
    if (request.method === "POST" && url.pathname === "/api/alerts/history") return alertHistory(request, env);
    if (request.method === "DELETE" && url.pathname === "/api/alerts/history") return alertHistory(request, env, true);
    return json({ error: "not_found" }, 404);
  },
};
