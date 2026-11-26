// Dashboard (deploy/grafana/haben.json) und Alarmregeln (deploy/helm/files/prometheus-regeln.yml) nennen nur Metriken,
// die /api/metrics ausgibt (#1871); nach einer Umbenennung blieben sie sonst still leer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderMetrics } from "../../packages/core/src/metriken.ts";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "../..");
type Ziel = { expr: string; datasource: { uid: string } };
type Panel = { title: string; targets: Ziel[]; datasource: { uid: string } };
const dashboard = JSON.parse(readFileSync(join(root, "deploy/grafana/haben.json"), "utf8")) as { uid: string; panels: Panel[] };
const regeln = Bun.YAML.parse(readFileSync(join(root, "deploy/helm/files/prometheus-regeln.yml"), "utf8")) as {
  groups: { rules: { alert: string; expr: string }[] }[];
};

// Jede Familie mit mindestens einem Wert
const ausgabe = renderMetrics({
  version: "1.0.0",
  commit: "abc",
  up: true,
  jobs: [{ task: "bank_sync", lastRun: 1, lastSuccess: 1, failures: 1 }],
  elster: [{ kind: "send", result: "ok", count: 1 }],
});
const vorhanden = new Set([...ausgabe.matchAll(/^# TYPE (\w+) /gm)].map(([, name]) => name));
// biome-ignore lint/suspicious/noTemplateCurlyInString: Variable von Grafana für die gewählte Datenquelle, kein Template-String
const DATENQUELLE = "${datasource}";
const genannt = (expr: string) => [...expr.matchAll(/\bhaben_\w+/g)].map(([name]) => name);

describe("Dashboard und Alarmregeln", () => {
  test("nennen nur Metriken, die /api/metrics ausgibt", () => {
    const ausDashboard = dashboard.panels.flatMap((p) => p.targets.flatMap((t) => genannt(t.expr)));
    const ausRegeln = regeln.groups.flatMap((g) => g.rules.flatMap((r) => genannt(r.expr)));
    expect(ausDashboard.length).toBeGreaterThan(0);
    expect(ausRegeln.length).toBeGreaterThan(0);
    expect([...ausDashboard, ...ausRegeln].filter((name) => !vorhanden.has(name))).toEqual([]);
  });

  test("das Dashboard fragt über die gewählte Datenquelle und Instanz ab, ohne feste Datenquelle", () => {
    for (const panel of dashboard.panels) {
      expect(panel.datasource.uid, panel.title).toBe(DATENQUELLE);
      for (const ziel of panel.targets) {
        expect(ziel.datasource.uid, panel.title).toBe(DATENQUELLE);
        expect(ziel.expr, panel.title).toContain('instance=~"$instance"');
      }
    }
  });
});
