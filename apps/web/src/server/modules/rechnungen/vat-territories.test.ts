import type { OutgoingTaxDetails, TaxTreatment } from "@haben/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";
import { kleinunternehmerStand } from "../auswertungen/test-umsatz-stand.ts";

describe.skipIf(!testDatabaseUrl)("Sondergebiete: Rechnungen, Angebote und Meldungen (Postgres)", () => {
  let sql: postgres.Sql;
  let invoices: typeof import("./index.ts");
  let recurring: typeof import("./recurring.ts");
  let contacts: typeof import("../stammdaten/index.ts");
  let vat: typeof import("../umsatzsteuer/index.ts");
  let bank: typeof import("../bank/index.ts");
  const actor = "sondergebiete-test";
  const actual: OutgoingTaxDetails = {
    exemption: null,
    ancillary: null,
    assetDisposal: false,
    foreignPlace: { country: "DE", postalCode: "27498", noForeignVat: true },
  };
  beforeAll(async () => {
    sql = await setupTestDb();
    invoices = await import("./index.ts");
    recurring = await import("./recurring.ts");
    contacts = await import("../stammdaten/index.ts");
    vat = await import("../umsatzsteuer/index.ts");
    bank = await import("../bank/index.ts");
  });
  afterAll(async () => {
    await sql?.end();
  });

  async function configure(kontenrahmen = "SKR03", versteuerung = "ist") {
    await leeren(sql)`truncate company, contacts, invoices, quotes, journal_entries, recurring_invoices, invoice_number_counters, quote_number_counters,
      bank_transactions, bank_imports, bank_accounts cascade`;
    await sql`insert into company (id,name,strasse,plz,ort,email,telefon,steuernummer,ust_id,bundesland,iban,kontenrahmen,versteuerung)
      values (1,'Testfirma','Beispielweg 1','93047','Regensburg','firma@example.com','0941 1','198/113/10010','DE136695976','BY',
      'DE89370400440532013000',${kontenrahmen},${versteuerung})`;
  }
  async function customer(land: string, plz: string, ustId = "") {
    return contacts.createContact(actor, {
      kundennummer: "",
      name: `Beispiel ${land} ${plz}`,
      strasse: "Beispielweg 7",
      plz,
      ort: "Beispielort",
      land,
      email: "kunde@example.com",
      ustId,
      iban: "",
      leitwegId: "",
      defaultFormat: null,
    });
  }
  const input = (contactId: string, taxTreatment: TaxTreatment, amount = 10_000, taxDetails: OutgoingTaxDetails | null = null) => ({
    contactId,
    issueDate: "2026-09-30",
    serviceFrom: "2026-09-30",
    serviceTo: null,
    paymentTermDays: 14,
    format: "xrechnung-ubl" as const,
    note: "",
    taxTreatment,
    taxDetails,
    lines: [{ description: "Beispielware oder Leistung", quantity: 1000, unit: "Psch." as const, unitPrice: amount, taxRate: 0 as const }],
  });
  async function final(contactId: string, treatment: TaxTreatment, amount = 10_000, details: OutgoingTaxDetails | null = null) {
    const draft = await invoices.createDraft(actor, input(contactId, treatment, amount, details));
    expect(await invoices.finalizeIssues(draft.id)).toEqual([]);
    return invoices.finalizeInvoice(actor, draft.id, kleinunternehmerStand);
  }

  it.each([
    ["SKR03", "ist"],
    ["SKR04", "soll"],
  ] as const)("%s/%s: Ausfuhr, bewusste IGL/RC und Drittland folgen der gewählten Behandlung in Kz 43/41/21/45 und ZM", async (kr, mode) => {
    await configure(kr, mode);
    for (const [country, postcode] of [
      ["DE", "27498"],
      ["DE", "78266"],
      ["ES", "35001"],
      ["ES", "38001"],
      ["ES", "51001"],
      ["ES", "52001"],
      ["IT", "23041"],
      ["IT", "22061"],
      ["GR", "63086"],
      ["GR", "63087"],
    ]) {
      const contact = await customer(country!, postcode!);
      const invoice = await final(contact.id, "ausfuhr");
      expect(invoice.xml).toContain("VATEX-EU-G");
      const postings = await sql`select l.account, l.tax_code from journal_lines l join journal_entries e on e.id=l.entry_id where e.source_id=${invoice.id}`;
      expect(postings).toContainEqual(expect.objectContaining({ account: kr === "SKR03" ? "8120" : "4120", tax_code: "Ausfuhr" }));
      const csv = `"Girokonto";"DE12 1203 0000 1234 5678 90"\n""\n"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"\n"30.09.26";"30.09.26";"Gebucht";"Beispielkunde";"Testfirma";"${invoice.number}";"Eingang";"DE02100100100006820101";"100,00";"";"";""\n`;
      await bank.importStatement(actor, { bytes: new TextEncoder().encode(csv), filename: `${invoice.number}.csv` }, null);
      const [transaction] = await sql`select id from bank_transactions where purpose = ${invoice.number}`;
      await bank.allocate(actor, { kind: "invoice", transactionId: transaction!.id, invoiceId: invoice.id, amount: 10_000 });
    }
    const madrid = { ...actual, foreignPlace: { country: "ES", postalCode: "28001", noForeignVat: true } };
    const mainland = await customer("ES", "28001", "ESB12345678");
    await final(mainland.id, "ig_lieferung", 11_000);
    // Rechnungsanschrift auf Teneriffa, empfangende Betriebsstätte in Madrid.
    const canary = await customer("ES", "38001", "ESB12345678");
    await final(canary.id, "reverse_charge", 12_000, madrid);
    const berlin = await customer("DE", "10115");
    const foreign = await final(berlin.id, "drittland", 13_000, actual);
    expect(foreign.taxDetails).toEqual(actual);
    expect(foreign.xml).toContain("VATEX-EU-O");
    expect(await vat.computeVatFigures({ year: 2026, month: 9 })).toMatchObject({ kz41: 11_000, kz43: 100_000, kz21: 12_000, kz45: 13_000 });
    expect((await vat.zmOverview({ year: 2026, month: 43 })).zeilen).toEqual([
      { ustId: "ESB12345678", art: "L", betrag: 11_000 },
      { ustId: "ESB12345678", art: "S", betrag: 12_000 },
    ]);
    // Die Käufer-PLZ ersetzt keinen ausdrücklich abweichenden tatsächlichen Leistungsort.
    const wrong = await invoices.createDraft(actor, input(canary.id, "drittland", 10_000, madrid));
    expect((await invoices.finalizeIssues(wrong.id)).join(" ")).toContain("Leistungsort");
  });

  it("bewahrt die ausdrückliche Orts-PLZ durch Speichern, Angebot, Serie, Korrektur und Storno; Alt-JSONs bleiben ohne neues Feld", async () => {
    await configure();
    const berlin = await customer("DE", "10115");
    const defaults = await invoices.newQuoteDefaults("2026-09-30");
    const quoteInput = { ...defaults, ...input(berlin.id, "drittland", 10_000, actual), validUntil: "2026-10-30" };
    const draftQuote = await invoices.createQuoteDraft(actor, quoteInput);
    expect((await invoices.getQuote(draftQuote.id))!.quote.taxDetails).toEqual(actual);
    expect((await invoices.updateQuoteDraft(actor, draftQuote.id, quoteInput)).taxDetails).toEqual(actual);
    await invoices.finalizeQuote(actor, draftQuote.id);
    await invoices.setQuoteDecision(actor, draftQuote.id, "angenommen");
    const converted = await invoices.quoteToInvoice(actor, draftQuote.id, "2026-09-30");
    expect(converted.taxDetails).toEqual(actual);
    const loaded = (await invoices.getInvoice(converted.id))!;
    expect((await invoices.updateDraft(actor, converted.id, invoices.draftInputOf(loaded.invoice, loaded.lines))).taxDetails).toEqual(actual);
    const original = await invoices.finalizeInvoice(actor, converted.id, kleinunternehmerStand);
    expect((await invoices.createCorrection(actor, original.id, "2026-09-30")).taxDetails).toEqual(actual);
    // Entwurf der Korrektur entfernen, dann den anderen Folgebeleg prüfen.
    const [correction] = await sql`select id from invoices where corrects_id=${original.id} and status='draft'`;
    await invoices.deleteDraft(actor, correction!.id);
    expect((await invoices.cancelInvoice(actor, original.id, "2026-09-30")).taxDetails).toEqual(actual);

    const template = await recurring.createRecurring(actor, {
      name: "Sondergebietsleistung",
      active: true,
      ...input(berlin.id, "drittland", 10_000, actual),
      exemptionReason: "",
      paymentMethod: "ueberweisung",
      recurrence: "P1M",
      nextDate: "2026-10-01",
      endDate: null,
      servicePeriod: "keiner",
      mode: "entwurf",
    });
    expect((await recurring.getRecurring(template.id))!.recurring.taxDetails).toEqual(actual);
    expect(recurring.invoiceForDate(template, "2026-10-01").taxDetails).toEqual(actual);
    const oldDetails = { ...actual, foreignPlace: { country: "CH", noForeignVat: true } };
    const old = await invoices.createDraft(actor, input(berlin.id, "drittland", 10_000, oldDetails));
    expect(old.taxDetails).toEqual(oldDetails);
    expect(Object.hasOwn(old.taxDetails!.foreignPlace!, "postalCode")).toBe(false);
  });
});
