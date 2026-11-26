import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";
import { kleinunternehmerStand } from "../auswertungen/test-umsatz-stand.ts";
import type { DraftInput } from "./draft-schema.ts";

describe.skipIf(!testDatabaseUrl)("Rechnungsaustausch: Bezug und Festschreibung (Postgres)", () => {
  let sql: postgres.Sql;
  let invoices: typeof import("./index.ts");
  let contactId: string;
  const actor = "rechnungsaustausch-pruefung";

  beforeAll(async () => {
    sql = await setupTestDb();
    invoices = await import("./index.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    await leeren(sql)`truncate seals, audit_log, company, invoices, invoice_number_counters, contacts, journal_entries cascade`;
    await sql`insert into company (id, name, strasse, plz, ort, email, telefon, steuernummer, bundesland, iban, kontenrahmen, versteuerung)
      values (1, 'Testfirma', 'Musterstraße 1', '93047', 'Regensburg', 'rechnung@example.com', '0941 1',
        '198/113/10010', 'BY', 'DE89370400440532013000', 'SKR03', 'soll')`;
    const contacts = await import("../stammdaten/index.ts");
    contactId = (
      await contacts.createContact(actor, {
        kundennummer: "",
        name: "Nordwerk Software GmbH",
        strasse: "Hafenstraße 5",
        plz: "20457",
        ort: "Hamburg",
        land: "DE",
        email: "rechnung@nordwerk.example",
        ustId: "",
        iban: "",
        leitwegId: "",
        defaultFormat: null,
      })
    ).id;
  });

  function input(issueDate: string, replacements: Partial<DraftInput> = {}): DraftInput {
    return {
      contactId,
      issueDate,
      serviceFrom: null,
      serviceTo: null,
      paymentTermDays: 14,
      format: "zugferd",
      note: "",
      lines: [{ description: "Beratung", quantity: 1000, unit: "Psch.", unitPrice: 100_000, taxRate: 1900 }],
      ...replacements,
    };
  }

  async function original() {
    const draft = await invoices.createDraft(actor, input("2026-10-05"));
    return invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand);
  }

  it("behält den Bezug bei normalen Änderungen und entfernt ihn bei ausdrücklichem Abwählen", async () => {
    const source = await original();
    const draft = await invoices.createDraft(actor, input("2026-12-15", { replacesInvoiceId: source.id }));
    expect(draft.replacesInvoiceId).toBe(source.id);

    const saved = await invoices.updateDraft(actor, draft.id, input("2026-12-15", { note: "Aktualisierte Anschrift" }));
    expect(saved.replacesInvoiceId).toBe(source.id);

    const cleared = await invoices.updateDraft(actor, draft.id, input("2026-12-15", { replacesInvoiceId: null }));
    expect(cleared.replacesInvoiceId).toBeNull();
  });

  it("lehnt den Ersatz ohne Storno, vor dem Stornodatum oder mit anderen Beträgen ab", async () => {
    const source = await original();
    const draft = await invoices.createDraft(actor, input("2026-12-05", { replacesInvoiceId: source.id }));
    await expect(invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand)).rejects.toThrow(/zuerst storniert/);

    await invoices.cancelInvoice(actor, source.id, "2026-12-10");
    await expect(invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand)).rejects.toThrow(/vor dem Storno/);

    const issueDate = "2026-12-15";
    const changed = input(issueDate);
    await invoices.updateDraft(actor, draft.id, { ...changed, lines: [{ ...changed.lines[0]!, unitPrice: 99_900 }] });
    await expect(invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand)).rejects.toThrow(/Beträge je Steuersatz/);
    expect((await invoices.getInvoice(draft.id))?.invoice).toMatchObject({ status: "draft", number: null, lockedAt: null });
  });

  it("versiegelt den Ersatzbezug und übernimmt den bisherigen Leistungstag", async () => {
    const source = await original();
    await invoices.cancelInvoice(actor, source.id, "2026-12-10");
    const draft = await invoices.createDraft(actor, input("2026-12-15", { replacesInvoiceId: source.id }));
    const duplicate = await invoices.createDraft(actor, input("2026-12-15", { replacesInvoiceId: source.id }));

    const saved = await invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand);
    expect(saved).toMatchObject({ serviceDate: source.serviceDate, replacesInvoiceId: source.id, advanceAccounting: source.advanceAccounting });
    expect(
      await sql`select columns -> 'invoices' ? 'replaces_invoice_id' as included from seals where table_name = 'invoices' and row_id = ${saved.id}`,
    ).toEqual([{ included: true }]);
    await expect(invoices.finalizeInvoice(actor, duplicate.id, kleinunternehmerStand)).rejects.toThrow(/bereits ersetzt/);
    await expect(invoices.updateDraft(actor, saved.id, input("2026-12-15", { replacesInvoiceId: null }))).rejects.toThrow();
    expect(await sql`select * from haben_integrity_problems(100)`).toEqual([]);
  });

  it("Nachfolgerechnung mit rückdatierter Zahlung mindert den offenen Posten am Stichtag", async () => {
    const source = await original();
    expect(source.advanceAccounting).toBeNull();
    await invoices.cancelInvoice(actor, source.id, "2026-11-10");
    const draft = await invoices.createDraft(actor, input("2026-12-15", { replacesInvoiceId: source.id }));
    const replacement = await invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand);
    const { openPositions } = await import("../auswertungen/index.ts");
    const { createCashInvoiceEntry } = await import("../bank/index.ts");
    const cutoff = "2026-11-30";
    expect((await openPositions(cutoff, { bis: cutoff })).receivablesTotal).toBe(119_000);

    await createCashInvoiceEntry(actor, { invoiceId: replacement.id, date: "2026-11-20", amount: 119_000 }, "2026-12-15");
    const [row] = await sql`select coalesce(sum(l.debit-l.credit),0)::int as saldo
      from journal_entries e join journal_lines l on l.entry_id=e.id where e.date <= ${cutoff} and l.account = '1400'`;
    expect(row?.saldo).toBe(0);
    expect((await openPositions(cutoff, { bis: cutoff })).receivablesTotal).toBe(0);
  });
});
