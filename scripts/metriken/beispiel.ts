import { JOBS, metricsText, recordElsterSubmission, recordJobRun } from "../../apps/web/src/server/metriken.ts";

/*
 * Beispielausgabe von GET /api/metrics (#1858) mit Werten für jeden Job und jede ELSTER-Kombination, für
 * `promtool check metrics` in der CI (Job check). Die Tests prüfen das Format mit eigenem Parser; promtool ist der
 * Parser von Prometheus selbst.
 */
const start = Date.UTC(2026, 10, 24, 3, 0);
JOBS.forEach((task, i) => {
  recordJobRun(task, true, start + i * 1500);
  recordJobRun(task, i % 2 === 0, start + 3_600_000 + i * 1500);
});
for (const kind of ["validate", "test", "send"] as const) {
  recordElsterSubmission(kind, true);
  recordElsterSubmission(kind, false);
}
process.stdout.write(metricsText({ version: '0.0.0-"beispiel"\\', commit: "0123abc", up: true }));
