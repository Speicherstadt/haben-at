import { buildPostfachAnfrageXml, buildPostfachBestaetigungXml, postfachDateiname, type ElsterClient, type PostfachBereitstellung } from "@haben/elster";
import { einspruchsfrist, parseBescheiddatum, type Bundesland } from "@haben/core";
import { and, desc, eq } from "drizzle-orm";
import { loadCompany } from "../stammdaten/index.ts";
import { encrypt } from "../../crypto.ts";
import { withActor } from "../../db/actor.ts";
import { db, schema } from "../../db/index.ts";
import { FinanzamtError } from "./finanzamt.ts";
import { type ErledigtStand, erledigtStand } from "./postfach-erledigt.ts";
import { sniff, storeFile } from "../../storage.ts";
import { ABRUF, isSimulated, loadActiveCertificate, PRODUKT_VERSION, signatur, zugang } from "../elster/index.ts";

export interface PostfachFetchOptions {
  kind: "test" | "send";
  pin?: string;
  /** Ohne PIN die gespeicherte nehmen (automatischer Abruf) */
  gespeichertePin?: boolean;
  herstellerId?: string;
}

export interface PostfachFetchSummary {
  ok: boolean;
  message: string;
  /** neu gespeicherte Dokumente */
  neu: number;
  fehler: { referenzId: string; fehler: string }[];
  bestaetigt: number;
  /** Fehlertext der Bestätigung, falls sie scheiterte */
  bestaetigungFehler: string | null;
}

/** Wer den automatischen Abruf im Audit-Log ausgelöst hat */
export const POSTFACH_ACTOR = "system:postfach";
/** Abstand zwischen zwei automatischen Abrufen */
export const AUTO_FETCH_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** Bescheide haben eine Einspruchsfrist, Mitteilungen nicht */
const isBescheid = (datenart: string) => datenart !== "EPMitteilung";

export async function listPostfachDocuments(limit = 200) {
  const [company, rows] = await Promise.all([
    loadCompany(),
    db
      .select({
        id: schema.postfachDocuments.id,
        bereitstellungId: schema.postfachDocuments.bereitstellungId,
        datenart: schema.postfachDocuments.datenart,
        veranlagungszeitraum: schema.postfachDocuments.veranlagungszeitraum,
        steuernummer: schema.postfachDocuments.steuernummer,
        bescheiddatum: schema.postfachDocuments.bescheiddatum,
        dateibezeichnung: schema.postfachDocuments.dateibezeichnung,
        filename: schema.postfachDocuments.filename,
        mimeType: schema.postfachDocuments.mimeType,
        size: schema.postfachDocuments.size,
        test: schema.postfachDocuments.test,
        fetchedAt: schema.postfachDocuments.fetchedAt,
      })
      .from(schema.postfachDocuments)
      // Fester zweiter Schlüssel: Anhänge einer Bereitstellung kommen im selben Takt, sonst entscheidet der Zufall
      .orderBy(desc(schema.postfachDocuments.fetchedAt), desc(schema.postfachDocuments.id))
      .limit(limit),
  ]);
  const erledigt = await erledigtStand(rows.map((row) => row.id));
  return rows.map((row) => {
    const datum = parseBescheiddatum(row.bescheiddatum);
    return {
      ...row,
      bescheiddatumIso: datum,
      frist: datum && isBescheid(row.datenart) ? einspruchsfrist(datum, company.bundesland as Bundesland | null) : null,
      /** „geprüft“ nimmt den Bescheid aus den Aufgaben, bis jemand ihn wieder öffnet (#1819) */
      erledigt: erledigt.get(row.id) ?? null,
    };
  });
}

type PostfachDokument = Awaited<ReturnType<typeof listPostfachDocuments>>[number];

/** Vergleichsform einer Dateibezeichnung: einfacher Leerraum, Groß- und Kleinschreibung egal */
const vergleichsform = (bezeichnung: string) => bezeichnung.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Echte Bescheide, deren Einspruchsfrist heute noch läuft; je Steuerfall und Zeitraum einer.
 *
 * Ein Änderungsbescheid (§§ 164, 165, 172 ff. AO) tritt an die Stelle des Bescheids, den er ändert; der alte bleibt nur
 * wirksam, soweit der neue ihn nicht erledigt (§ 124 Abs. 2 AO). Ergeht der neue, solange die Frist des alten läuft, ist
 * er voll anfechtbar (§ 351 Abs. 1 AO beschränkt nur Änderungen unanfechtbarer Bescheide), und seine Frist endet nie
 * früher. Deshalb zählt je Datenart, Veranlagungszeitraum, Steuernummer und Zeitraum nur das jüngste Bescheiddatum;
 * sonst steht die erledigte Frist gleichrangig daneben (#1817). Daraus lesen Aufgaben, Fristen, Kalender-Abo und MCP.
 *
 * Monat oder Quartal liefert ELSTER nicht verlässlich als Feld: `veranlagungszeitraum` ist optional und kann bei
 * Anmeldesteuern einen Teilzeitraum tragen (SSb ElsterDatenabholung V32, Kap. 9.2 und 9.3). Die Dateibezeichnung des
 * Finanzamts („Umsatzsteuer-Vorauszahlungsbescheid Januar 2025“) wird deshalb so, wie sie kommt, Teil des Schlüssels;
 * Monatsnamen aus dem Freitext zu lesen wäre geraten (Quartale, „Januar bis März“, abweichende Schreibweisen) und könnte
 * zwei Zeiträume zusammenwerfen und damit eine offene Frist verschlucken. Anhänge desselben Bescheids tragen verschiedene
 * Bezeichnungen; zusammengehalten werden sie über ihre Bereitstellung. Fehlt der Veranlagungszeitraum, ist der Zeitraum
 * nicht bestimmt, und sonstige Verwaltungsakte sind eigenständig: Dort bleibt jede Bereitstellung für sich, damit keine
 * offene Frist verschwindet.
 */
export async function openAppealDeadlines(today: string) {
  const offen = (await listPostfachDocuments()).filter(
    (d): d is PostfachDokument & { bescheiddatumIso: string; frist: NonNullable<PostfachDokument["frist"]> } =>
      !d.test && d.frist !== null && d.frist.fristende >= today && d.bescheiddatumIso !== null,
  );
  const bezeichnungen = new Map<string, Set<string>>();
  for (const dokument of offen) {
    const menge = bezeichnungen.get(dokument.bereitstellungId) ?? new Set<string>();
    menge.add(vergleichsform(dokument.dateibezeichnung));
    bezeichnungen.set(dokument.bereitstellungId, menge);
  }
  const gruppen = new Map<string, (typeof offen)[number][]>();
  for (const bescheid of offen) {
    const zeitraum = [...(bezeichnungen.get(bescheid.bereitstellungId) ?? [])].sort().join("\u0001");
    // Ohne Veranlagungszeitraum ist der Zeitraum nicht bestimmt: Gleich benannte Bescheide verschiedener Jahre dürfen
    // dann nicht zusammenfallen, sonst verschwindet eine offene Frist. Dasselbe gilt für sonstige Verwaltungsakte, die
    // eigenständig sind und deren Bezeichnung nichts unterscheidet, etwa zwei Verspätungszuschläge desselben Jahres.
    // Dort zählt jede Bereitstellung für sich; ihre Anhänge bleiben eine Frist.
    const einzeln = bescheid.veranlagungszeitraum === "" || bescheid.datenart === "DivaSonstigerVA";
    const schluessel = einzeln
      ? `einzeln\u0000${bescheid.bereitstellungId}`
      : [bescheid.datenart, bescheid.veranlagungszeitraum, bescheid.steuernummer, zeitraum].join("\u0000");
    const liste = gruppen.get(schluessel) ?? [];
    liste.push(bescheid);
    gruppen.set(schluessel, liste);
  }
  // Erst nach der Gruppierung filtern: Anhänge desselben Bescheids teilen sich die Aufgabe (#1819). Maßgeblich ist das
  // gelesene Datum, nicht die rohe Spalte, weil der Parser JJJJMMTT, JJJJ-MM-TT und TT.MM.JJJJ kennt. Tragen mehrere
  // Anhänge dasselbe Bescheiddatum, entscheidet unter ihnen das jüngste Ereignis und nicht eines von ihnen allein: sonst
  // bliebe „Wieder offen“ folgenlos, solange ein anderer Anhang geprüft ist (#1819). Ein älterer Bescheid derselben
  // Gruppe lässt die Frist dagegen nicht wieder aufleben. Ohne Ereignis gilt der Bescheid als offen; bei gleichem
  // Zeitstempel bleibt die erste Zeile, weil die Liste fest sortiert ist.
  type MitEreignis = (typeof offen)[number] & { erledigt: ErledigtStand };
  const offenBleibend: typeof offen = [];
  for (const liste of gruppen.values()) {
    const juengster = liste.reduce((a, b) => (b.bescheiddatumIso > a.bescheiddatumIso ? b : a));
    const amJuengsten = liste.filter((d): d is MitEreignis => d.bescheiddatumIso === juengster.bescheiddatumIso && d.erledigt !== null);
    const letztes = amJuengsten.reduce<MitEreignis | null>((a, b) => (a === null || b.erledigt.at > a.erledigt.at ? b : a), null);
    // Zurück kommt der Anhang, dessen Vermerk den Ausschlag gibt: an ihm hängt der Knopf der Aufgabe.
    if (letztes?.erledigt.art !== "geprueft") offenBleibend.push(letztes ?? juengster);
  }
  return offenBleibend.sort((a, b) => a.frist.fristende.localeCompare(b.frist.fristende));
}

export async function postfachDocumentFile(id: string) {
  const [row] = await db
    .select({ sha256: schema.postfachDocuments.sha256, mimeType: schema.postfachDocuments.mimeType, filename: schema.postfachDocuments.filename })
    .from(schema.postfachDocuments)
    .where(eq(schema.postfachDocuments.id, id));
  return row;
}

export async function lastPostfachRequest() {
  const [row] = await db
    .select({
      createdAt: schema.postfachRequests.createdAt,
      ok: schema.postfachRequests.ok,
      message: schema.postfachRequests.message,
      test: schema.postfachRequests.test,
    })
    .from(schema.postfachRequests)
    .where(eq(schema.postfachRequests.art, "anfrage"))
    .orderBy(desc(schema.postfachRequests.createdAt))
    .limit(1);
  return row ?? null;
}

/** Vollständig abgeholte, aber noch nicht bestätigte Bereitstellungen */
export async function pendingConfirmations(test: boolean): Promise<string[]> {
  const rows = await db
    .select({ art: schema.postfachRequests.art, ids: schema.postfachRequests.bereitstellungIds })
    .from(schema.postfachRequests)
    .where(and(eq(schema.postfachRequests.test, test), eq(schema.postfachRequests.ok, true)));
  const abgeholt = new Set(rows.filter((r) => r.art === "anfrage").flatMap((r) => r.ids));
  for (const id of rows.filter((r) => r.art === "bestaetigung").flatMap((r) => r.ids)) abgeholt.delete(id);
  return [...abgeholt];
}

/**
 * Holt Bescheide und Mitteilungen aus dem ELSTER-Postfach, speichert sie und bestätigt danach die Abholung.
 * Bestätigt wird nur, was vollständig gespeichert ist; eine gescheiterte Bestätigung holt der nächste Abruf nach.
 */
export async function fetchPostfach(actor: string, client: ElsterClient, options: PostfachFetchOptions): Promise<PostfachFetchSummary> {
  const { test, herstellerId } = zugang(client, options.kind, options.herstellerId, ABRUF);
  const { pfx, pin } = await signatur({ pin: options.pin, gespeichertePin: options.gespeichertePin });
  const company = await loadCompany();
  const person = company.taxpayer.a;
  const datenlieferant = (person ? `${person.vorname} ${person.name}` : company.name).trim() || "Haben";
  const xmlInput = { datenlieferant, herstellerId, produktVersion: PRODUKT_VERSION, test };

  const anfrageXml = buildPostfachAnfrageXml(xmlInput);
  const result = await client.fetchPostfach(anfrageXml, pfx, pin, { test, herstellerId });

  const inhalt = new Map(result.dateien.flatMap((d) => (d.inhalt ? [[d.referenzId, d.inhalt] as const] : [])));
  const fehler = result.dateien.flatMap((d) => (d.fehler ? [{ referenzId: d.referenzId, fehler: d.fehler }] : []));
  const stored = await storeAll(result.bereitstellungen, inhalt);
  const complete = result.bereitstellungen.filter((b) => b.anhaenge.length > 0 && b.anhaenge.every((a) => stored.has(a.referenzId))).map((b) => b.id);

  const neu = await withActor(actor, async (tx) => {
    const [request] = await tx
      .insert(schema.postfachRequests)
      .values({
        art: "anfrage",
        test,
        ok: result.ok,
        code: result.code,
        message: result.message,
        bereitstellungIds: complete,
        fehler,
        requestXml: anfrageXml,
        responseXml: result.responseXml,
        serverResponseXml: result.serverResponseXml,
      })
      .returning({ id: schema.postfachRequests.id });
    const rows = result.bereitstellungen.flatMap((b) =>
      b.anhaenge.flatMap((a) => {
        const file = stored.get(a.referenzId);
        if (!file) return [];
        return [
          {
            referenzId: a.referenzId,
            bereitstellungId: b.id,
            datenart: b.datenart,
            veranlagungszeitraum: b.veranlagungszeitraum,
            steuernummer: b.steuernummer,
            bescheiddatum: b.bescheiddatum,
            dateibezeichnung: a.dateibezeichnung,
            mimeType: file.mimeType,
            filename: postfachDateiname(b, a),
            sha256: file.sha256,
            size: file.size,
            test,
            requestId: request!.id,
          },
        ];
      }),
    );
    if (rows.length === 0) return 0;
    const inserted = await tx.insert(schema.postfachDocuments).values(rows).onConflictDoNothing().returning({ id: schema.postfachDocuments.id });
    return inserted.length;
  });

  if (!result.ok) return { ok: false, message: result.message, neu, fehler, bestaetigt: 0, bestaetigungFehler: null };

  const pending = await pendingConfirmations(test);
  let bestaetigt = 0;
  let bestaetigungFehler: string | null = null;
  if (pending.length > 0) {
    const bestaetigungXml = buildPostfachBestaetigungXml(pending, xmlInput);
    const confirmation = await client.send(bestaetigungXml, pfx, pin, { test, print: false });
    await withActor(actor, (tx) =>
      tx.insert(schema.postfachRequests).values({
        art: "bestaetigung",
        test,
        ok: confirmation.ok,
        code: confirmation.code,
        message: confirmation.message,
        bereitstellungIds: pending,
        requestXml: bestaetigungXml,
        responseXml: confirmation.responseXml,
        serverResponseXml: confirmation.serverResponseXml,
      }),
    );
    if (confirmation.ok) bestaetigt = pending.length;
    else bestaetigungFehler = confirmation.message;
  }

  const message =
    neu === 0 && fehler.length === 0 ? "Keine neuen Dokumente im Postfach." : `${neu} neue${neu === 1 ? "s" : ""} Dokument${neu === 1 ? "" : "e"} abgeholt.`;
  return { ok: true, message, neu, fehler, bestaetigt, bestaetigungFehler };
}

/** Legt die Anhänge im Dokumentenspeicher ab; Typ nach Inhalt, sonst laut ELSTER */
async function storeAll(bereitstellungen: PostfachBereitstellung[], inhalt: Map<string, Uint8Array>) {
  const stored = new Map<string, { sha256: string; mimeType: string; size: number }>();
  for (const anhang of bereitstellungen.flatMap((b) => b.anhaenge)) {
    const bytes = inhalt.get(anhang.referenzId);
    if (!bytes) continue;
    const sha256 = await storeFile(bytes);
    const mimeType = sniff(bytes)?.mimeType ?? (anhang.dateityp || "application/octet-stream");
    stored.set(anhang.referenzId, { sha256, mimeType, size: bytes.byteLength });
  }
  return stored;
}

/** Stand des automatischen Abrufs: an, seit wann, letzter echter Abruf */
export async function autoFetchStatus() {
  const certificate = await loadActiveCertificate();
  const [last] = await db
    .select({ createdAt: schema.postfachRequests.createdAt, ok: schema.postfachRequests.ok, message: schema.postfachRequests.message })
    .from(schema.postfachRequests)
    .where(and(eq(schema.postfachRequests.art, "anfrage"), eq(schema.postfachRequests.test, false)))
    .orderBy(desc(schema.postfachRequests.createdAt))
    .limit(1);
  return { enabled: Boolean(certificate?.pinCiphertext), since: certificate?.pinSavedAt ?? null, lastLive: last ?? null };
}

/**
 * Schaltet den automatischen Abruf ein: ruft sofort echt ab und speichert die PIN erst, wenn das klappt,
 * verschlüsselt am aktiven Zertifikat. Ein neues Zertifikat schaltet den Abruf damit wieder aus.
 */
export async function enableAutoFetch(actor: string, client: ElsterClient, pin: string, herstellerId: string | undefined): Promise<PostfachFetchSummary> {
  const summary = await fetchPostfach(actor, client, { kind: "send", pin, herstellerId });
  if (!summary.ok) throw new FinanzamtError(`Abruf fehlgeschlagen, die PIN wurde nicht gespeichert: ${summary.message}`);
  const certificate = await loadActiveCertificate();
  await withActor(actor, (tx) =>
    tx
      .update(schema.elsterCertificates)
      .set({ pinCiphertext: encrypt(new TextEncoder().encode(pin)), pinSavedAt: new Date() })
      .where(eq(schema.elsterCertificates.id, certificate!.id)),
  );
  return summary;
}

export async function disableAutoFetch(actor: string): Promise<void> {
  await withActor(actor, (tx) =>
    tx.update(schema.elsterCertificates).set({ pinCiphertext: null, pinSavedAt: null }).where(eq(schema.elsterCertificates.active, true)),
  );
}

/** Für den Scheduler: echter Abruf mit gespeicherter PIN, höchstens alle 20 Stunden */
export async function runDuePostfachFetch(client: ElsterClient, herstellerId: string | undefined, now = new Date()): Promise<PostfachFetchSummary | null> {
  if (!herstellerId || isSimulated(client)) return null;
  const certificate = await loadActiveCertificate();
  if (!certificate?.pinCiphertext) return null;
  const { lastLive } = await autoFetchStatus();
  if (lastLive && now.getTime() - lastLive.createdAt.getTime() < AUTO_FETCH_INTERVAL_MS) return null;
  return fetchPostfach(POSTFACH_ACTOR, client, { kind: "send", gespeichertePin: true, herstellerId });
}
