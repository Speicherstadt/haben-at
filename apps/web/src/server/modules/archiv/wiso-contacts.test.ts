import { CONTACT_FIELDS, contactCandidates, readCsvTable, suggestMapping } from "@haben/import";
import { describe, expect, it, vi } from "vitest";
import { previewWisoContacts } from "./wiso-contacts.ts";

const extract = vi.hoisted(() => vi.fn());
vi.mock("../belege/index.ts", () => ({ pdfPageTexts: extract }));
const pdf = new TextEncoder().encode("%PDF-1.4");

function readContacts(csv: string) {
  const result = readCsvTable(Buffer.from(csv), { encoding: "auto", delimiter: "auto" });
  if (!result.ok) throw new Error(result.error);
  return contactCandidates(result.table, suggestMapping(result.table.header, CONTACT_FIELDS));
}

describe("WISO-Kontaktvorschau", () => {
  it("behält Nummer und Amtsspalten im CSV und verlangt die Prüfung von Rolle und Land", async () => {
    extract.mockResolvedValueOnce({
      truncated: false,
      pages: [
        [
          "Kunden / Interessenten",
          "Name, Anschrift             Telefon       Kontaktdaten       Bankverbindung       Umsatz                   Notizen",
          '0001, Muster; "Firma"       k.A.          k.A.               k.A.                  Umsatz (netto): 0,00 €   k.A.',
          "Beispielweg 1",
          "L - 1821 Luxembourg",
          "2. Anschrift",
          "k.A.",
        ].join("\n"),
      ],
    });
    const result = await previewWisoContacts(pdf);
    expect(result.draft.filename).toBe("WISO-Kontakte-Entwurf.csv");
    const csv = Buffer.from(result.draft.base64, "base64").toString("utf8");
    const [draft] = readContacts(csv);
    expect(draft?.value).toBeNull();
    expect(draft?.errors).toEqual([expect.stringMatching(/Land/), expect.stringMatching(/Rolle/)]);
    const [ready] = readContacts(csv.replace("L - 1821", "1821").replace("Bitte prüfen;Bitte prüfen", "LU;Kunde"));
    expect(ready?.errors).toEqual([]);
    expect(ready?.value).toMatchObject({ kundennummer: "0001", name: 'Muster; "Firma"', plz: "1821", land: "LU", isCustomer: true, debitorNr: null });
  });

  it("lehnt Fremddateien, fehlenden Text und gekürzte PDFs ab", async () => {
    await expect(previewWisoContacts(new TextEncoder().encode("Kontakte"))).rejects.toThrow(/als PDF/);
    extract.mockResolvedValueOnce({ truncated: false, pages: ["\n"] });
    await expect(previewWisoContacts(pdf)).rejects.toThrow(/nicht als Text lesen/);
    extract.mockResolvedValueOnce({ truncated: true, pages: ["WISO"] });
    await expect(previewWisoContacts(pdf)).rejects.toThrow(/100 Seiten/);
  });
});
