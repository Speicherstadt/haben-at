import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";
import { kleinunternehmerStand } from "../auswertungen/test-umsatz-stand.ts";

/*
 * Steuerfreie Umsätze ohne Vorsteuerabzug (Kz 48) und mit Vorsteuerabzug (Kz 43) bei Ist-Versteuerung im Zeitraum der
 * Leistung (#1312). Anleitung zur UStVA 2026 (https://www.elster.de/eportal/helpGlobal?themaGlobal=help_ustva_2026), in
 * beiden Abschnitten gleich: „Anzahlungen zu steuerfreien Umsätzen tragen Sie bitte nicht ein. Den Gesamtbetrag
 * (Anzahlungen und Restzahlung) geben Sie bitte im Voranmeldungszeitraum der Leistungsausführung an.“ Eine Ausnahme für
 * die Ist-Versteuerung nennt sie nicht; Anzahlungen zählen deshalb auch bei Soll nicht. Storno und Korrektur nach Zahlung
 * mindern bei Ist wie bei Soll erst mit der Rückzahlung (#1228, UStAE 17.1 Abs. 2 Satz 3).
 */

function dkbCsv(rows: string[][]) {
  const header = `"Girokonto";"DE12 1203 0000 1234 5678 90"\n""\n`;
  const columns = `"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"\n`;
  return new TextEncoder().encode(`${header + columns + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n")}\n`);
}

type Behandlung = "steuerfrei" | "ausfuhr";
const KZ = { steuerfrei: "kz48", ausfuhr: "kz43" } as const;
const SEP = { year: 2026, month: 9 };
const OKT = { year: 2026, month: 10 };
const NOV = { year: 2026, month: 11 };

describe.skipIf(!testDatabaseUrl)("Kz 43 und 48 bei Ist im Zeitraum der Leistung (Postgres)", () => {
  let vat: typeof import("./index.ts");
  let bank: typeof import("../bank/index.ts");
  let invoices: typeof import("../rechnungen/index.ts");
  let contacts: typeof import("../stammdaten/contacts.ts");
  let abgleich: typeof import("../auswertungen/abgleich.ts");
  let sql: postgres.Sql;
  const actor = "kz48-ist-test";

  beforeAll(async () => {
    sql = await setupTestDb();
    vat = await import("./index.ts");
    bank = await import("../bank/index.ts");
    invoices = await import("../rechnungen/index.ts");
    contacts = await import("../stammdaten/contacts.ts");
    abgleich = await import("../auswertungen/abgleich.ts");
  }, 30_000);
  afterAll(async () => {
    await sql?.end();
  });

  async function firma(kontenrahmen: "SKR03" | "SKR04", versteuerung: "ist" | "soll") {
    await leeren(sql)`truncate vat_return_submissions, vat_returns, write_offs, allocations, bank_transactions, bank_imports,
      bank_accounts, cash_entries, journal_lines, journal_entries, invoice_lines, invoice_taxes, invoices, invoice_number_counters,
      contact_versions, contacts, company cascade`;
    await sql`insert into company (id, name, strasse, plz, ort, email, telefon, steuernummer, ust_id, bundesland, iban, versteuerung, kontenrahmen)
      values (1, 'Testfirma', 'Musterstraße 1', '93047', 'Regensburg', 'rechnung@example.com', '+49 941 1', '198/113/10010',
              'DE123456789', 'BY', 'DE89370400440532013000', ${versteuerung}, ${kontenrahmen})`;
  }

  async function kunde(behandlung: Behandlung) {
    return (
      await contacts.createContact(actor, {
        kundennummer: "",
        name: `Kunde ${behandlung}`,
        strasse: "Ring 1",
        plz: behandlung === "ausfuhr" ? "8001" : "20457",
        ort: behandlung === "ausfuhr" ? "Zürich" : "Hamburg",
        land: behandlung === "ausfuhr" ? "CH" : "DE",
        email: "a@b.example",
        ustId: "",
        iban: "",
        leitwegId: "",
        defaultFormat: null,
      })
    ).id;
  }

  async function rechnung(behandlung: Behandlung, net: number, felder: Record<string, unknown>) {
    const draft = await invoices.createDraft(actor, {
      contactId: await kunde(behandlung),
      paymentTermDays: 14,
      format: "zugferd",
      note: "",
      taxTreatment: behandlung,
      exemptionReason: behandlung === "steuerfrei" ? "Steuerfrei nach § 4 Nr. 14 UStG" : "Steuerfreie Ausfuhrlieferung nach § 4 Nr. 1 Buchst. a UStG",
      lines: [{ description: "Leistung", quantity: 1000, unit: "Psch." as const, unitPrice: net, taxRate: 0 }],
      serviceTo: null,
      ...felder,
    } as never);
    return invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand);
  }

  async function zahlung(invoiceId: string, date: string, amount: string) {
    const purpose = crypto.randomUUID();
    const row = [date, date, "Gebucht", "Kunde", "Testfirma", purpose, "Eingang", "DE02100100100006820101", amount, "", "", ""];
    await bank.importStatement(actor, { bytes: dkbCsv([row]), filename: `${purpose}.csv` }, null);
    const [tx] = await sql`select id, amount from bank_transactions where purpose = ${purpose}`;
    await bank.allocate(actor, { kind: "invoice", transactionId: tx!.id, invoiceId, amount: Number(tx!.amount) });
  }

  /** Kz 43 bzw. 48 je Monat; die Quellen unter der Kennzahl ergeben denselben Betrag */
  async function kennzahl(behandlung: Behandlung, period: { year: number; month: number }) {
    const f = await vat.computeVatFigures(period);
    const ausQuellen = f.revenue.filter((r) => r.treatment === behandlung).reduce((s, r) => s + r.base, 0);
    expect(ausQuellen, `Quellen ${behandlung} ${period.month}/${period.year}`).toBe(f[KZ[behandlung]]);
    return f[KZ[behandlung]];
  }

  async function journalSauber(periods: { year: number; month: number }[]) {
    for (const p of periods) expect(abgleich.abweichungen((await abgleich.vatAbgleich(p)).zeilen), JSON.stringify(p)).toEqual([]);
  }

  /** Anzahlung 200 € im September bezahlt, Leistung im Oktober über 1.000 €, Schlussrechnung im November, Rest 800 € im November bezahlt */
  async function anzahlungUndSchluss(behandlung: Behandlung) {
    const anzahlung = await rechnung(behandlung, 20_000, { issueDate: "2026-09-05", serviceFrom: null, variant: "abschlag", advanceType: "anzahlung" });
    await zahlung(anzahlung.id, "10.09.26", "200,00");
    const schluss = await rechnung(behandlung, 100_000, {
      issueDate: "2026-11-02",
      serviceFrom: "2026-10-01",
      serviceTo: "2026-10-31",
      variant: "schluss",
      deducts: [anzahlung.id],
      contactId: anzahlung.contactId,
    });
    expect(schluss.net).toBe(80_000);
    await zahlung(schluss.id, "16.11.26", "800,00");
  }

  for (const kontenrahmen of ["SKR03", "SKR04"] as const)
    for (const behandlung of ["steuerfrei", "ausfuhr"] as const)
      it(`${kontenrahmen}/ist: ${KZ[behandlung]} mit Anzahlung im September, Leistung im Oktober, Rest im November`, async () => {
        await firma(kontenrahmen, "ist");
        await anzahlungUndSchluss(behandlung);
        expect(await kennzahl(behandlung, SEP)).toBe(0);
        expect(await kennzahl(behandlung, OKT)).toBe(100_000);
        expect(await kennzahl(behandlung, NOV)).toBe(0);
        await journalSauber([SEP, OKT, NOV]);
      }, 60_000);

  for (const [kontenrahmen, behandlung] of [
    ["SKR03", "steuerfrei"],
    ["SKR04", "ausfuhr"],
  ] as const)
    it(`${kontenrahmen}/soll: ${KZ[behandlung]} mit Anzahlung ebenso im Monat der Leistung, die Anzahlung nicht`, async () => {
      await firma(kontenrahmen, "soll");
      await anzahlungUndSchluss(behandlung);
      expect([await kennzahl(behandlung, SEP), await kennzahl(behandlung, OKT), await kennzahl(behandlung, NOV)]).toEqual([0, 100_000, 0]);
      await journalSauber([SEP, OKT, NOV]);
    }, 60_000);

  for (const [kontenrahmen, versteuerung, behandlung] of [
    ["SKR03", "ist", "steuerfrei"],
    ["SKR04", "ist", "ausfuhr"],
    ["SKR04", "soll", "steuerfrei"],
    ["SKR03", "soll", "ausfuhr"],
  ] as const)
    it(`${kontenrahmen}/${versteuerung}: ${KZ[behandlung]} im Monat der Leistung, nicht der Rechnung oder Zahlung`, async () => {
      await firma(kontenrahmen, versteuerung);
      const inv = await rechnung(behandlung, 50_000, { issueDate: "2026-10-03", serviceFrom: "2026-09-01", serviceTo: "2026-09-30" });
      await zahlung(inv.id, "05.11.26", "500,00");
      expect([await kennzahl(behandlung, SEP), await kennzahl(behandlung, OKT), await kennzahl(behandlung, NOV)]).toEqual([50_000, 0, 0]);
    }, 60_000);

  for (const [kontenrahmen, behandlung] of [
    ["SKR04", "steuerfrei"],
    ["SKR03", "ausfuhr"],
  ] as const)
    it(`${kontenrahmen}/ist: Storno im Monat des Stornos, mit umgekehrtem Vorzeichen`, async () => {
      await firma(kontenrahmen, "ist");
      const inv = await rechnung(behandlung, 50_000, { issueDate: "2026-09-10", serviceFrom: "2026-09-10" });
      await invoices.cancelInvoice(actor, inv.id, "2026-11-02");
      expect([await kennzahl(behandlung, SEP), await kennzahl(behandlung, OKT), await kennzahl(behandlung, NOV)]).toEqual([50_000, 0, -50_000]);
    }, 60_000);

  for (const [kontenrahmen, versteuerung, behandlung] of [
    ["SKR03", "ist", "steuerfrei"],
    ["SKR04", "ist", "ausfuhr"],
    ["SKR04", "soll", "steuerfrei"],
    ["SKR03", "soll", "ausfuhr"],
  ] as const)
    it(`${kontenrahmen}/${versteuerung}: Storno einer bezahlten Rechnung mindert ${KZ[behandlung]} erst mit der Rückzahlung`, async () => {
      // #1228 bei Ist wie bei Soll: UStAE 17.1 Abs. 2 Satz 3; die Anleitung zur UStVA 2026 („in dem Voranmeldungszeitraum …, in
      // dem die Änderung der Bemessungsgrundlage eingetreten ist“) sagt nichts anderes
      await firma(kontenrahmen, versteuerung);
      const inv = await rechnung(behandlung, 50_000, { issueDate: "2026-09-10", serviceFrom: "2026-09-10" });
      await zahlung(inv.id, "05.10.26", "500,00");
      const storno = await invoices.cancelInvoice(actor, inv.id, "2026-11-02");
      await zahlung(storno.id, "10.12.26", "-500,00");
      const DEZ = { year: 2026, month: 12 };
      expect([await kennzahl(behandlung, SEP), await kennzahl(behandlung, OKT), await kennzahl(behandlung, NOV), await kennzahl(behandlung, DEZ)]).toEqual([
        50_000, 0, 0, -50_000,
      ]);
      await journalSauber([SEP, OKT, NOV, DEZ]);
    }, 60_000);

  for (const kontenrahmen of ["SKR03", "SKR04"] as const)
    it(`${kontenrahmen}/ist: Skonto mindert Kz 48 im Monat der Ausbuchung, die Aufhebung gegenläufig`, async () => {
      // Anleitung zur UStVA 2026, Allgemein: „Bitte berücksichtigen Sie Entgelterhöhungen und Entgeltminderungen bei den Bemessungsgrundlagen.“
      await firma(kontenrahmen, "ist");
      const inv = await rechnung("steuerfrei", 80_000, { issueDate: "2026-10-03", serviceFrom: "2026-09-01", serviceTo: "2026-09-30" });
      await zahlung(inv.id, "05.10.26", "784,00");
      await bank.writeOff(actor, { kind: "skonto", invoiceId: inv.id, date: "2026-10-05" });
      const [skonto] = await bank.listWriteOffs({ invoiceId: inv.id });
      await bank.reverseWriteOff(actor, skonto!.id, "2026-11-04");
      expect([await kennzahl("steuerfrei", SEP), await kennzahl("steuerfrei", OKT), await kennzahl("steuerfrei", NOV)]).toEqual([80_000, -1_600, 1_600]);
    }, 60_000);

  it("SKR04/ist: Bareinnahme ohne Rechnung zählt am Tag der Zahlung, eine Bareinnahme auf eine Rechnung nicht", async () => {
    await firma("SKR04", "ist");
    await bank.createCashIncome(actor, { date: "2026-10-12", amount: 20_000, text: "Kurs", steuer: { behandlung: "steuerfrei", steuersatz: 0 } }, "2026-11-23");
    const inv = await rechnung("steuerfrei", 30_000, { issueDate: "2026-09-20", serviceFrom: "2026-09-20" });
    await bank.createCashInvoiceEntry(actor, { invoiceId: inv.id, date: "2026-10-14", amount: 30_000 }, "2026-11-23");
    expect([await kennzahl("steuerfrei", SEP), await kennzahl("steuerfrei", OKT)]).toEqual([30_000, 20_000]);
  }, 60_000);

  for (const [kontenrahmen, behandlung] of [
    ["SKR03", "steuerfrei"],
    ["SKR04", "ausfuhr"],
  ] as const)
    it(`${kontenrahmen}/ist: Leistung in einem schon gesendeten Monat zeigt an der Rechnung den Hinweis zur Berichtigung`, async () => {
      // Keine spätere Voranmeldung enthält die Rechnung, die Zahlung meldet sie nicht mehr (wie bei Soll, #694)
      await firma(kontenrahmen, "ist");
      const entwurf = await vat.saveDraft(actor, OKT, { mode: "berechnet" });
      await sql`update vat_returns set status = 'sent', sent_at = now() - interval '1 day' where id = ${entwurf.id}`;
      const inv = await rechnung(behandlung, 50_000, { issueDate: "2026-11-03", serviceFrom: "2026-10-01", serviceTo: "2026-10-31" });
      expect(await invoices.leistungsmonatHinweisFuer(inv)).toContain("gehört in die Voranmeldung 10/2026");
      const anzahlung = await rechnung(behandlung, 20_000, {
        issueDate: "2026-11-05",
        serviceFrom: "2026-10-01",
        variant: "abschlag",
        advanceType: "anzahlung",
      });
      expect(await invoices.leistungsmonatHinweisFuer(anzahlung)).toBeNull();
    }, 60_000);
  /** Ein Jahr nach Ist, danach Soll: erst eine Buchung im alten Jahr, dann der Wechsel (versteuerungForYear) */
  async function wechselVonIstZuSoll(kontenrahmen: "SKR03" | "SKR04", behandlung: Behandlung) {
    await firma(kontenrahmen, "ist");
    const alt = await rechnung(behandlung, 10_000, { issueDate: "2025-11-03", serviceFrom: "2025-11-03" });
    await zahlung(alt.id, "20.11.25", "100,00");
    await sql`update company set versteuerung = 'soll'`;
  }
  const DEZ25 = { year: 2025, month: 12 };
  const JAN26 = { year: 2026, month: 1 };
  const FEB26 = { year: 2026, month: 2 };

  for (const [kontenrahmen, behandlung] of [
    ["SKR03", "steuerfrei"],
    ["SKR04", "ausfuhr"],
  ] as const)
    it(`${kontenrahmen}: nach dem Wechsel von Ist zu Soll zählen Zahlung und Skonto einer Leistung des Ist-Jahres ${KZ[behandlung]} nicht noch einmal`, async () => {
      // TDD-Review: Die Leistung im Dezember (Ist) steht im Dezember; die Zahlung im Soll-Jahr meldete sie ein zweites Mal
      await wechselVonIstZuSoll(kontenrahmen, behandlung);
      const inv = await rechnung(behandlung, 50_000, { issueDate: "2026-01-15", serviceFrom: "2025-12-01", serviceTo: "2025-12-20" });
      await zahlung(inv.id, "10.02.26", "490,00");
      await bank.writeOff(actor, { kind: "skonto", invoiceId: inv.id, date: "2026-02-10" });
      const company = await import("../stammdaten/company.ts");
      expect([await company.versteuerungForYear(2025), await company.versteuerungForYear(2026)]).toEqual(["ist", "soll"]);
      expect([await kennzahl(behandlung, DEZ25), await kennzahl(behandlung, JAN26), await kennzahl(behandlung, FEB26)]).toEqual([50_000, 0, -1_000]);
      await journalSauber([DEZ25, JAN26, FEB26]);
    }, 60_000);

  it("SKR04: Storno nach dem Wechsel von Ist zu Soll mindert Kz 48 einer bezahlten Leistung des Ist-Jahres erst mit der Rückzahlung", async () => {
    await firma("SKR04", "ist");
    const inv = await rechnung("steuerfrei", 50_000, { issueDate: "2025-12-05", serviceFrom: "2025-12-05" });
    await zahlung(inv.id, "15.12.25", "500,00");
    await sql`update company set versteuerung = 'soll'`;
    const storno = await invoices.cancelInvoice(actor, inv.id, "2026-01-20");
    await zahlung(storno.id, "10.02.26", "-500,00");
    expect([await kennzahl("steuerfrei", DEZ25), await kennzahl("steuerfrei", JAN26), await kennzahl("steuerfrei", FEB26)]).toEqual([50_000, 0, -50_000]);
    await journalSauber([DEZ25, JAN26, FEB26]);
  }, 60_000);

  for (const [kontenrahmen, versteuerung, behandlung] of [
    ["SKR03", "soll", "steuerfrei"],
    ["SKR04", "ist", "ausfuhr"],
  ] as const)
    it(`${kontenrahmen}/${versteuerung}: Hinweis an der Schlussrechnung nennt das Entgelt samt abgezogener Anzahlung, wie ${KZ[behandlung]}`, async () => {
      // TDD-Review: Kz 43 und 48 enthalten die ganze Leistung; der Hinweis nannte nur den Rest der Schlussrechnung
      await firma(kontenrahmen, versteuerung);
      const entwurf = await vat.saveDraft(actor, OKT, { mode: "berechnet" });
      await sql`update vat_returns set status = 'sent', sent_at = now() - interval '1 day' where id = ${entwurf.id}`;
      const anzahlung = await rechnung(behandlung, 20_000, { issueDate: "2026-09-05", serviceFrom: null, variant: "abschlag", advanceType: "anzahlung" });
      await zahlung(anzahlung.id, "10.09.26", "200,00");
      const schluss = await rechnung(behandlung, 100_000, {
        issueDate: "2026-11-02",
        serviceFrom: "2026-10-01",
        serviceTo: "2026-10-31",
        variant: "schluss",
        deducts: [anzahlung.id],
        contactId: anzahlung.contactId,
      });
      expect(await kennzahl(behandlung, OKT)).toBe(100_000);
      expect(await invoices.leistungsmonatHinweisFuer(schluss)).toMatch(/\(netto 1\.000,00\s€, Umsatzsteuer 0,00\s€\)/);
    }, 60_000);

  /*
   * Rechnungsaustausch (#1454) mit Kennzeichen exempt_rule (#1312): Storno und Ersatz dokumentieren dieselbe Leistung, sie
   * zählt einmal im Leistungsmonat (§ 14c Abs. 1 UStG greift nicht, der Ersatz weist keine Steuer aus; UStAE 14.11).
   */
  for (const kontenrahmen of ["SKR03", "SKR04"] as const)
    for (const versteuerung of ["ist", "soll"] as const)
      for (const bezahlt of [true, false])
        it(`${kontenrahmen}, ${versteuerung}, ${bezahlt ? "bezahlt" : "offen"}: Rechnungsaustausch zählt Kz 48 einmal im Oktober`, async () => {
          await firma(kontenrahmen, versteuerung);
          const leistung = { serviceFrom: "2026-10-01", serviceTo: "2026-10-31" };
          const original = await rechnung("steuerfrei", 100_000, { ...leistung, issueDate: "2026-10-12" });
          if (bezahlt) await zahlung(original.id, "2026-10-20", "1000,00");
          await invoices.cancelInvoice(actor, original.id, "2026-11-10");
          await rechnung("steuerfrei", 100_000, { ...leistung, issueDate: "2026-11-15", contactId: original.contactId, replacesInvoiceId: original.id });

          expect.soft(await kennzahl("steuerfrei", OKT)).toBe(100_000);
          expect.soft(await kennzahl("steuerfrei", NOV)).toBe(0);
          await journalSauber([OKT, NOV]);
        }, 30_000);
});
