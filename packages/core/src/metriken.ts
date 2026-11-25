/*
 * Metriken im Textformat 0.0.4 von Prometheus (Exposition formats, https://prometheus.io/docs/instrumenting/exposition_formats/),
 * für GET /api/metrics (#1858). Rein: Die App übergibt Zeitpunkte und Zähler, hier entsteht nur der Text. Labels tragen
 * nur feste Werte (Jobnamen, Vorgang, Ergebnis), nie Meldungen, Namen, Beträge oder IDs.
 */

export interface JobMetrics {
  /** Fester Name des Jobs, etwa „bank_sync“ */
  task: string;
  /** Ende des letzten Laufs seit dem Start, Millisekunden seit 1970 */
  lastRun?: number;
  /** Ende des letzten erfolgreichen Laufs seit dem Start */
  lastSuccess?: number;
  failures: number;
}

export interface MetricsSnapshot {
  version: string | null;
  commit: string | null;
  /** Ergebnis der Prüfung hinter /api/health */
  up: boolean;
  jobs: JobMetrics[];
  /** Antworten von ERiC je Vorgang (validate, test, send) und Ergebnis (ok, error) */
  elster: { kind: string; result: string; count: number }[];
}

type Sample = [labels: Record<string, string>, value: number];

/** Backslash, Anführungszeichen und Zeilenumbruch maskiert, wie das Textformat es für Labelwerte verlangt */
const escapeLabel = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

function family(name: string, type: "gauge" | "counter", help: string, samples: Sample[]): string {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
  for (const [labels, value] of samples) {
    const pairs = Object.entries(labels).map(([key, v]) => `${key}="${escapeLabel(v)}"`);
    lines.push(`${name}${pairs.length ? `{${pairs.join(",")}}` : ""} ${value}`);
  }
  return lines.join("\n");
}

/*
 * Das Label heißt `task`, nicht `job`: `job` setzt Prometheus selbst für das Scrape-Ziel und benennt ein gleichnamiges
 * Label der Ausgabe in `exported_job` um. Zeitpunkte fehlen, solange es seit dem Start keinen Lauf bzw. Erfolg gab.
 */
export function renderMetrics(snapshot: MetricsSnapshot): string {
  const zeitpunkte = (feld: "lastRun" | "lastSuccess") =>
    snapshot.jobs.flatMap((job): Sample[] => {
      const at = job[feld];
      return at ? [[{ task: job.task }, at / 1000]] : [];
    });
  const families = [
    family("haben_info", "gauge", "Version und Commit dieser Instanz", [[{ version: snapshot.version ?? "", commit: snapshot.commit ?? "" }, 1]]),
    family("haben_up", "gauge", "1, wenn /api/health pass meldet (Datenbank erreichbar, Migrationen angewendet), sonst 0", [[{}, snapshot.up ? 1 : 0]]),
    family("haben_job_last_run_timestamp_seconds", "gauge", "Ende des letzten Laufs eines Hintergrundjobs seit dem Start", zeitpunkte("lastRun")),
    family(
      "haben_job_last_success_timestamp_seconds",
      "gauge",
      "Ende des letzten erfolgreichen Laufs eines Hintergrundjobs seit dem Start",
      zeitpunkte("lastSuccess"),
    ),
    family(
      "haben_job_failures_total",
      "counter",
      "Gescheiterte Läufe eines Hintergrundjobs seit dem Start",
      snapshot.jobs.map((job): Sample => [{ task: job.task }, job.failures]),
    ),
    family(
      "haben_elster_submissions_total",
      "counter",
      "Antworten von ERiC auf Prüfen (validate), Testübermittlung (test) und Echtübermittlung (send) seit dem Start, nach Ergebnis",
      snapshot.elster.map(({ kind, result, count }): Sample => [{ kind, result }, count]),
    ),
  ];
  return `${families.join("\n")}\n`;
}
