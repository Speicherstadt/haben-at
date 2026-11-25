import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";

const TOKEN = "a".repeat(64);
const get = (authorization?: string) => new Request("http://localhost/api/metrics", { headers: authorization ? { authorization } : {} });

describe.skipIf(!testDatabaseUrl)("GET /api/metrics (Postgres)", () => {
  let sql: postgres.Sql;
  let betrieb: typeof import("./metriken.ts");
  let metriken: typeof import("../../metriken.ts");

  beforeAll(async () => {
    sql = await setupTestDb();
    betrieb = await import("./metriken.ts");
    metriken = await import("../../metriken.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    metriken.resetMetrics();
    await leeren(sql)`truncate company cascade`;
  });

  it("gibt es ohne Token nicht, mit fehlendem oder falschem Token nur 401", async () => {
    expect((await betrieb.metricsResponse(get(`Bearer ${TOKEN}`), { token: "" })).status).toBe(404);
    const ohne = await betrieb.metricsResponse(get(), { token: TOKEN });
    expect(ohne.status).toBe(401);
    expect(ohne.headers.get("WWW-Authenticate")).toMatch(/^Bearer /);
    expect((await betrieb.metricsResponse(get(`Bearer ${TOKEN}x`), { token: TOKEN })).status).toBe(401);
    expect((await betrieb.metricsResponse(get(`Basic ${TOKEN}`), { token: TOKEN })).status).toBe(401);
  });

  it("meldet mit Token Version, Health, Jobs und ELSTER, aber nichts aus der Buchhaltung", async () => {
    await sql`insert into company (id, name, strasse, plz, ort, steuernummer, bundesland, email, iban)
      values (1, 'Leckprobe Handels GmbH', 'Geheimweg 7', '93047', 'Regensburg', '198/113/10010', 'BY', 'chefin@leckprobe.example', 'DE89370400440532013000')`;
    metriken.recordJobRun("bank_sync", false);
    metriken.recordElsterSubmission("send", true);

    const response = await betrieb.metricsResponse(get(`bearer ${TOKEN}`), { token: TOKEN, commit: "0123abc" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text).toMatch(/^haben_info\{version="[^"]+",commit="0123abc"\} 1$/m);
    expect(text).toMatch(/^haben_up 1$/m);
    expect(text).toMatch(/^haben_job_failures_total\{task="bank_sync"\} 1$/m);
    expect(text).toMatch(/^haben_elster_submissions_total\{kind="send",result="ok"\} 1$/m);
    expect(text).not.toMatch(/Leckprobe|Geheimweg|chefin|DE89|198\/113/);
  });
});
