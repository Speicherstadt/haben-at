import { describe, expect, it } from "vitest";
import { type MetricsSnapshot, renderMetrics } from "./metriken.ts";

/**
 * Prüft das Textformat 0.0.4 (Prometheus, Exposition formats) streng genug für Prometheus: HELP und TYPE vor den Werten
 * einer Familie, Namen und Labels nach den Namensregeln, Werte als Zahl, keine Reihe doppelt. Gibt die Fehler zurück.
 */
function formatFehler(text: string): string[] {
  const fehler: string[] = [];
  if (!text.endsWith("\n")) fehler.push("Zeilenumbruch am Ende fehlt");
  const NAME = "[a-zA-Z_:][a-zA-Z0-9_:]*";
  const LABEL = `[a-zA-Z_][a-zA-Z0-9_]*="(?:[^"\\\\\\n]|\\\\[\\\\"n])*"`;
  const sample = new RegExp(`^(${NAME})(?:\\{(${LABEL}(?:,${LABEL})*)?\\})? (-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?|NaN|[+-]Inf)$`);
  const typen = new Map<string, string>();
  const reihen = new Set<string>();
  let familie: string | undefined;
  for (const zeile of text.replace(/\n$/, "").split("\n")) {
    const help = new RegExp(`^# HELP (${NAME}) \\S`).exec(zeile);
    const type = new RegExp(`^# TYPE (${NAME}) (counter|gauge)$`).exec(zeile);
    const wert = sample.exec(zeile);
    if (help) familie = help[1];
    else if (type) {
      if (type[1] !== familie || typen.has(type[1]!)) fehler.push(`TYPE ohne HELP davor oder doppelt: ${zeile}`);
      typen.set(type[1]!, type[2]!);
    } else if (wert) {
      if (wert[1] !== familie || !typen.has(wert[1]!)) fehler.push(`Wert außerhalb seiner Familie: ${zeile}`);
      if (typen.get(wert[1]!) === "counter" && !wert[1]!.endsWith("_total")) fehler.push(`Zähler ohne _total: ${zeile}`);
      const reihe = `${wert[1]}{${wert[2] ?? ""}}`;
      if (reihen.has(reihe)) fehler.push(`Reihe doppelt: ${zeile}`);
      reihen.add(reihe);
    } else fehler.push(`Zeile ungültig: ${zeile}`);
  }
  return fehler;
}

const wert = (text: string, reihe: string) =>
  text
    .split("\n")
    .find((z) => z.startsWith(`${reihe} `))
    ?.split(" ")[1];

const leer: MetricsSnapshot = { version: "1.2.3", commit: null, up: false, jobs: [], elster: [] };

describe("Metriken im Textformat von Prometheus", () => {
  it("gibt ohne Läufe gültiges Textformat aus, Zähler ohne Zeitpunkte", () => {
    const text = renderMetrics({ ...leer, jobs: [{ task: "bank_sync", failures: 0 }] });
    expect(formatFehler(text)).toEqual([]);
    expect(wert(text, 'haben_info{version="1.2.3",commit=""}')).toBe("1");
    expect(wert(text, "haben_up")).toBe("0");
    expect(wert(text, 'haben_job_failures_total{task="bank_sync"}')).toBe("0");
    expect(text).not.toMatch(/^haben_job_last_(run|success)_timestamp_seconds\{/m);
  });

  it("gibt Zeitpunkte in Sekunden und Zähler je Job und ELSTER-Ergebnis aus", () => {
    const text = renderMetrics({
      version: "1.2.3",
      commit: "abc",
      up: true,
      jobs: [
        { task: "fints_sync", lastRun: 1_700_007_200_000, lastSuccess: 1_700_000_000_500, failures: 2 },
        { task: "bank_sync", failures: 0 },
      ],
      elster: [
        { kind: "send", result: "ok", count: 2 },
        { kind: "send", result: "error", count: 1 },
      ],
    });
    expect(formatFehler(text)).toEqual([]);
    expect(wert(text, "haben_up")).toBe("1");
    expect(wert(text, 'haben_job_last_run_timestamp_seconds{task="fints_sync"}')).toBe("1700007200");
    expect(wert(text, 'haben_job_last_success_timestamp_seconds{task="fints_sync"}')).toBe("1700000000.5");
    expect(wert(text, 'haben_job_failures_total{task="fints_sync"}')).toBe("2");
    expect(text).not.toContain('haben_job_last_run_timestamp_seconds{task="bank_sync"}');
    expect(wert(text, 'haben_elster_submissions_total{kind="send",result="ok"}')).toBe("2");
    expect(wert(text, 'haben_elster_submissions_total{kind="send",result="error"}')).toBe("1");
  });

  it("enthält nur Metriknamen, feste Labels und Zahlen", () => {
    const text = renderMetrics({
      ...leer,
      jobs: [{ task: "bank_sync", lastRun: 1, lastSuccess: 1, failures: 3 }],
      elster: [{ kind: "test", result: "ok", count: 1 }],
    });
    const werte = text.split("\n").filter((z) => z && !z.startsWith("#"));
    for (const zeile of werte) expect(zeile).toMatch(/^haben_[a-z_]+(\{[a-z_]+="[a-z0-9_.]*"(,[a-z_]+="[a-z0-9_.]*")*\})? [0-9.]+$/);
  });

  it("maskiert Anführungszeichen, Backslash und Zeilenumbruch in Labels", () => {
    const text = renderMetrics({ ...leer, version: '1"\\\n' });
    expect(formatFehler(text)).toEqual([]);
    expect(text).toContain('haben_info{version="1\\"\\\\\\n",commit=""} 1');
  });

  it("die Prüfung des Formats erkennt Fehler", () => {
    expect(formatFehler("haben_up 1\n")).toEqual(["Wert außerhalb seiner Familie: haben_up 1"]);
    expect(formatFehler('# HELP a x\n# TYPE a gauge\na{b="c} 1\n')).toEqual(['Zeile ungültig: a{b="c} 1']);
    expect(formatFehler("# HELP a x\n# TYPE a counter\na 1\na 2")).toEqual([
      "Zeilenumbruch am Ende fehlt",
      "Zähler ohne _total: a 1",
      "Zähler ohne _total: a 2",
      "Reihe doppelt: a 2",
    ]);
  });
});
