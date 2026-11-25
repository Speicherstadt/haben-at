import { beforeEach, describe, expect, it } from "vitest";
import { JOBS, metricsText, recordElsterSubmission, recordJobRun, resetMetrics } from "./metriken.ts";

const wert = (text: string, reihe: string) =>
  text
    .split("\n")
    .find((z) => z.startsWith(`${reihe} `))
    ?.split(" ")[1];
const info = { version: "1.2.3", commit: null, up: true };

describe("Zähler für /api/metrics", () => {
  beforeEach(() => resetMetrics());

  it("nennt vor dem ersten Lauf jeden Job und jede ELSTER-Kombination mit null, ohne Zeitpunkte", () => {
    const text = metricsText(info);
    for (const task of JOBS) expect(wert(text, `haben_job_failures_total{task="${task}"}`)).toBe("0");
    for (const kind of ["validate", "test", "send"])
      for (const result of ["ok", "error"]) expect(wert(text, `haben_elster_submissions_total{kind="${kind}",result="${result}"}`)).toBe("0");
    expect(text).not.toMatch(/^haben_job_last_(run|success)_timestamp_seconds\{/m);
  });

  it("ein gescheiterter Lauf erhöht die Fehler und lässt den letzten Erfolg stehen, ein erfolgreicher setzt ihn", () => {
    recordJobRun("fints_sync", true, 1_700_000_000_000);
    recordJobRun("fints_sync", false, 1_700_003_600_000);
    recordJobRun("fints_sync", false, 1_700_007_200_000);
    let text = metricsText(info);
    expect(wert(text, 'haben_job_failures_total{task="fints_sync"}')).toBe("2");
    expect(wert(text, 'haben_job_last_success_timestamp_seconds{task="fints_sync"}')).toBe("1700000000");
    expect(wert(text, 'haben_job_last_run_timestamp_seconds{task="fints_sync"}')).toBe("1700007200");
    expect(wert(text, 'haben_job_failures_total{task="bank_sync"}')).toBe("0");

    recordJobRun("fints_sync", true, 1_700_010_800_000);
    text = metricsText(info);
    expect(wert(text, 'haben_job_last_success_timestamp_seconds{task="fints_sync"}')).toBe("1700010800");
    expect(wert(text, 'haben_job_failures_total{task="fints_sync"}')).toBe("2");
  });

  it("zählt ELSTER-Antworten je Vorgang und Ergebnis", () => {
    recordElsterSubmission("send", true);
    recordElsterSubmission("send", false);
    recordElsterSubmission("send", true);
    const text = metricsText(info);
    expect(wert(text, 'haben_elster_submissions_total{kind="send",result="ok"}')).toBe("2");
    expect(wert(text, 'haben_elster_submissions_total{kind="send",result="error"}')).toBe("1");
    expect(wert(text, 'haben_elster_submissions_total{kind="validate",result="ok"}')).toBe("0");
  });
});
