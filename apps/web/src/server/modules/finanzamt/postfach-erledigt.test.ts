import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";

describe.skipIf(!testDatabaseUrl)("Postfach: Erledigt-Vermerke (Postgres)", () => {
  let erledigt: typeof import("./postfach-erledigt.ts");
  let postfach: typeof import("./postfach.ts");
  let sql: postgres.Sql;
  const actor = "test-user";

  beforeAll(async () => {
    sql = await setupTestDb();
    erledigt = await import("./postfach-erledigt.ts");
    postfach = await import("./postfach.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    await leeren(sql)`truncate postfach_erledigt, postfach_documents, postfach_requests, company cascade`;
    await sql`insert into company (id, name, strasse, plz, ort, steuernummer, bundesland)
      values (1, 'Testfirma', 'Musterstraße 1', '93047', 'Regensburg', '198/113/10010', 'BY')`;
    await sql`insert into postfach_requests (art, test, ok, code, message, request_xml, response_xml, server_response_xml)
      values ('anfrage', false, true, 0, 'ok', '<x/>', '<x/>', '<x/>')`;
  });

  /** Bescheid aus dem Postfach; Frist bei Bescheiddatum 2025-06-30 endet am 2025-08-04 */
  async function bescheid(over: Partial<{ bereitstellung: string; datum: string; bezeichnung: string; datenart: string }> = {}) {
    const [row] = await sql<{ id: string }[]>`
      insert into postfach_documents
        (referenz_id, bereitstellung_id, datenart, veranlagungszeitraum, steuernummer, bescheiddatum, dateibezeichnung,
         mime_type, filename, sha256, size, test, request_id)
      values (${`R-${Math.random().toString(36).slice(2)}`}, ${over.bereitstellung ?? "B1"}, ${over.datenart ?? "DivaBescheidESt"},
        '2024', '9198011310010', ${over.datum ?? "2025-06-30"}, ${over.bezeichnung ?? "Bescheid ESt"},
        'application/pdf', 'bescheid.pdf', 'abc', 5, false, (select id from postfach_requests limit 1))
      returning id`;
    if (!row) throw new Error("Bescheid nicht angelegt");
    return row.id;
  }

  it("lässt die Frist offen, solange niemand abhakt", async () => {
    await bescheid();
    expect((await postfach.openAppealDeadlines("2025-07-10")).map((d) => d.frist.fristende)).toEqual(["2025-08-04"]);
  });

  it("nimmt die Aufgabe weg und bringt sie beim Wiederöffnen zurück", async () => {
    const id = await bescheid();
    await erledigt.erledigtVermerken(id, "geprueft", actor);
    expect(await postfach.openAppealDeadlines("2025-07-10")).toEqual([]);
    await erledigt.erledigtVermerken(id, "wieder_offen", actor);
    expect((await postfach.openAppealDeadlines("2025-07-10")).map((d) => d.id)).toEqual([id]);
  });

  it("zeigt den Vermerk am Dokument an", async () => {
    const id = await bescheid();
    await erledigt.erledigtVermerken(id, "geprueft", actor);
    const [dokument] = await postfach.listPostfachDocuments();
    expect(dokument?.id).toBe(id);
    expect(dokument?.erledigt?.art).toBe("geprueft");
  });

  it("legt beim zweiten gleichen Vermerk kein zweites Ereignis an", async () => {
    const id = await bescheid();
    await erledigt.erledigtVermerken(id, "geprueft", actor);
    const zweite = await erledigt.erledigtVermerken(id, "geprueft", actor);
    expect(zweite.unveraendert).toBe(true);
    const [zeile] = await sql<{ anzahl: number }[]>`select count(*)::int as anzahl from postfach_erledigt where document_id = ${id}`;
    expect(zeile?.anzahl).toBe(1);
  });

  it("lässt den älteren Anhang nicht wieder auftauchen, wenn der jüngste Bescheid geprüft ist", async () => {
    await bescheid({ datum: "2025-06-30" });
    const juengster = await bescheid({ datum: "2025-07-31", bezeichnung: "Bescheid ESt, Anlage N" });
    expect(await postfach.openAppealDeadlines("2025-07-10")).toHaveLength(1);
    await erledigt.erledigtVermerken(juengster, "geprueft", actor);
    expect(await postfach.openAppealDeadlines("2025-07-10")).toEqual([]);
  });

  it("wertet den Bescheid als geprüft, wenn bei gleichem Bescheiddatum der andere Anhang abgehakt wird", async () => {
    // Zwei Anhänge derselben Bereitstellung mit gleichem Bescheiddatum tragen dieselbe Aufgabe; welcher davon abgehakt
    // wird, darf für das Verschwinden der Frist keinen Unterschied machen (#1819).
    const erster = await bescheid({ datum: "2025-06-30", bezeichnung: "Bescheid ESt" });
    await bescheid({ datum: "2025-06-30", bezeichnung: "Bescheid ESt, Anlage N" });
    expect(await postfach.openAppealDeadlines("2025-07-10")).toHaveLength(1);
    await erledigt.erledigtVermerken(erster, "geprueft", actor);
    expect(await postfach.openAppealDeadlines("2025-07-10")).toEqual([]);
  });

  it("holt die Aufgabe zurück, wenn bei gleichem Bescheiddatum ein Anhang wieder geöffnet wird", async () => {
    // Abhaken und Wiederöffnen sind symmetrisch: Unter den Anhängen mit dem Bescheiddatum des jüngsten Bescheids
    // entscheidet das jüngste Ereignis, nicht „einer von ihnen ist geprüft“ (#1819). Zurück kommt der Anhang, dessen
    // Vermerk den Ausschlag gibt; sonst stünde die Aufgabe mit dem Knopf eines schon abgehakten Anhangs da.
    const erster = await bescheid({ datum: "2025-06-30", bezeichnung: "Bescheid ESt" });
    const zweiter = await bescheid({ datum: "2025-06-30", bezeichnung: "Bescheid ESt, Anlage N" });
    await erledigt.erledigtVermerken(erster, "geprueft", actor);
    await erledigt.erledigtVermerken(zweiter, "geprueft", actor);
    expect(await postfach.openAppealDeadlines("2025-07-10")).toEqual([]);
    await erledigt.erledigtVermerken(zweiter, "wieder_offen", actor);
    expect((await postfach.openAppealDeadlines("2025-07-10")).map((d) => d.id)).toEqual([zweiter]);
    await erledigt.erledigtVermerken(zweiter, "geprueft", actor);
    expect(await postfach.openAppealDeadlines("2025-07-10")).toEqual([]);
  });

  it("schreibt den Akteur ins Audit-Log und lässt den Vermerk nicht ändern", async () => {
    const id = await bescheid();
    await erledigt.erledigtVermerken(id, "geprueft", actor);
    const [eintrag] = await sql<{ actor: string | null }[]>`
      select actor from audit_log where table_name = 'postfach_erledigt' order by seq desc limit 1`;
    expect(eintrag?.actor).toBe(actor);
    await expect(sql`update postfach_erledigt set art = 'wieder_offen' where document_id = ${id}`).rejects.toThrow();
  });
});
