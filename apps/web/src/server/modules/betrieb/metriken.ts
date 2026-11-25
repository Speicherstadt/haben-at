import { createHash, timingSafeEqual } from "node:crypto";
import { readAppVersion } from "../../db/app-version.ts";
import { createHealthProbe, type HealthStatus } from "../../db/health.ts";
import { db } from "../../db/index.ts";
import { env } from "../../env.ts";
import { metricsText } from "../../metriken.ts";

let probe: (() => Promise<HealthStatus>) | undefined;

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Bearer-Token aus dem Header gegen HABEN_METRICS_TOKEN, in gleicher Zeit für jede Länge */
function tokenPasst(request: Request, token: string): boolean {
  const given = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  return !!given && timingSafeEqual(digest(given), digest(token));
}

export interface MetricsOptions {
  /** Ohne Angabe HABEN_METRICS_TOKEN; ohne Token gibt es den Endpunkt nicht */
  token?: string;
  /** Ohne Angabe HABEN_COMMIT */
  commit?: string | null;
}

/**
 * GET /api/metrics (#1858) im Textformat von Prometheus: nur mit eigenem Token, ohne Sitzung und ohne API-Token, damit ein
 * Scraper keine Leserechte auf die Buchhaltung bekommt. Die Ausgabe sagt, ob Haben läuft, nicht wie das Geschäft läuft:
 * keine Beträge, Namen, IBANs oder IDs.
 */
export async function metricsResponse(request: Request, options: MetricsOptions = {}): Promise<Response> {
  const token = options.token !== undefined ? options.token : env().HABEN_METRICS_TOKEN;
  if (!token) return new Response("Not Found", { status: 404 });
  if (!tokenPasst(request, token)) return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="metrics"' } });

  probe ??= createHealthProbe(db.$client);
  const up = (await probe()) === "pass";
  const commit = options.commit !== undefined ? options.commit : env().HABEN_COMMIT?.trim() || null;
  const body = metricsText({ version: readAppVersion(), commit, up });
  return new Response(body, { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}
