import { createFileRoute } from "@tanstack/react-router";
import { metricsResponse } from "../../server/modules/betrieb/index.ts";

/** Prometheus-Metriken, nur mit HABEN_METRICS_TOKEN (#1858) */
export const Route = createFileRoute("/api/metrics")({
  server: { handlers: { GET: ({ request }) => metricsResponse(request) } },
});
