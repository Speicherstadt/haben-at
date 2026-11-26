import type { StoreSettlement } from "@haben/import";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";
import { kleinunternehmerStand } from "../auswertungen/test-umsatz-stand.ts";

const DESTINATIONS = [
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
] as const;

describe.skipIf(!testDatabaseUrl)("Store-Entwürfe an Sondergebiete (Postgres)", () => {
  let sql: postgres.Sql;
  let stores: typeof import("./index.ts");
  let drafts: typeof import("./drafts.ts");
  let invoices: typeof import("../rechnungen/index.ts");
  let contacts: typeof import("../stammdaten/index.ts");
  let vat: typeof import("../umsatzsteuer/index.ts");
  const actor = "sondergebiete-test";
  beforeAll(async () => {
    sql = await setupTestDb();
    stores = await import("./index.ts");
    drafts = await import("./drafts.ts");
    invoices = await import("../rechnungen/index.ts");
    contacts = await import("../stammdaten/index.ts");
    vat = await import("../umsatzsteuer/index.ts");
  });
  afterAll(async () => {
    await sql?.end();
  });

  it("schlägt Drittland statt RC vor und belässt gewöhnliche PLZ sowie Monaco", () => {
    const propose = drafts.storeTreatment as (country: string, postcode?: string) => string | null;
    for (const [country, postcode] of DESTINATIONS) expect(propose(country, postcode)).toBe("drittland");
    expect([propose("DE", "10115"), propose("ES", "28001"), propose("IT", "20121"), propose("GR", "10557"), propose("MC", "98000")]).toEqual([
      null,
      "reverse_charge",
      "reverse_charge",
      "reverse_charge",
      "reverse_charge",
    ]);
  });

  it.each([
    ["SKR03", "ist"],
    ["SKR04", "soll"],
  ] as const)("%s/%s: auswählbar, Drittlandentwürfe, Kz 45 und keine ZM; spätere Adressänderung schreibt nichts um", async (kontenrahmen, versteuerung) => {
    await leeren(sql)`truncate company, contacts, invoices, journal_entries, store_connections, invoice_number_counters cascade`;
    await sql`insert into company (id,name,strasse,plz,ort,email,telefon,steuernummer,ust_id,bundesland,iban,kontenrahmen,versteuerung)
      values (1,'Testfirma','Beispielweg 1','93047','Regensburg','firma@example.com','0941 1','198/113/10010','DE136695976','BY',
      'DE89370400440532013000',${kontenrahmen},${versteuerung})`;
    const { encrypt } = await import("../../crypto.ts");
    await sql`insert into store_connections (store,config,ciphertext,fetch_from)
      values ('googleplay', '{"store":"googleplay","bucket":"test"}', ${encrypt(Buffer.from("Testschlüssel"))}, '2026-09-01')`;
    for (const [country, postcode] of DESTINATIONS) {
      const contact = await contacts.createContact(actor, {
        kundennummer: "",
        name: `Beispiel ${country} ${postcode}`,
        strasse: "Beispielweg 7",
        plz: postcode,
        ort: "Beispielort",
        land: country,
        email: "kunde@example.com",
        ustId: "",
        iban: "",
        leitwegId: "",
        defaultFormat: null,
      });
      expect((await stores.storeContactChoices()).some((choice) => choice.id === contact.id)).toBe(true);
      await stores.setStoreContact(actor, { store: "googleplay", contactId: contact.id });
      const settlement: StoreSettlement = {
        reference: `${country}-${postcode}`,
        period: "2026-09",
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        currency: "EUR",
        net: 10_000,
        euro: 10_000,
        rate: null,
        parts: [],
        lines: 1,
      };
      expect(await drafts.createSettlementDrafts(actor, "googleplay", [settlement], "2026-09-30")).toMatchObject({ created: 1 });
      const [draft] = await sql`select * from invoices where external_id = ${settlement.reference}`;
      expect(draft).toMatchObject({ tax_treatment: "drittland", net: 10_000, tax: 0 });
      // Tatsächlich vereinnahmt, damit Ist/Soll auf denselben abgeschlossenen Sachverhalt geprüft werden.
      await sql`update invoices set payment_method = 'bereits_bezahlt', paid_via = 'Store', paid_on = '2026-09-30' where id = ${draft!.id}`;
      const final = await invoices.finalizeInvoice(actor, draft!.id, kleinunternehmerStand);
      await contacts.updateContact(actor, contact.id, {
        ...contact,
        kundennummer: contact.kundennummer ?? "",
        lieferantennummer: contact.lieferantennummer ?? "",
        land: country === "DE" ? "DE" : "ES",
        plz: "28001",
      });
      const [unchanged] = await sql`select tax_treatment, buyer, pdf, xml, net, tax, gross from invoices where id = ${final.id}`;
      expect(unchanged).toMatchObject({ tax_treatment: "drittland", buyer: { land: country, plz: postcode }, net: 10_000, tax: 0 });
      expect(Buffer.from(unchanged!.pdf)).toEqual(Buffer.from(final.pdf!));
      expect(unchanged!.xml).toBe(final.xml);
      await expect(sql`update invoices set tax_treatment = 'reverse_charge' where id = ${final.id}`).rejects.toThrow(/festgeschrieben/);
      expect(await drafts.createSettlementDrafts(actor, "googleplay", [settlement], "2026-09-30")).toMatchObject({ created: 0 });
    }
    expect(await vat.computeVatFigures({ year: 2026, month: 9 })).toMatchObject({ kz21: 0, kz41: 0, kz43: 0, kz45: 100_000 });
    expect((await vat.zmOverview({ year: 2026, month: 43 })).zeilen).toEqual([]);
  });
});
