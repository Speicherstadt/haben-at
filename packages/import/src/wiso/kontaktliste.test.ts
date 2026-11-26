import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWisoContactList } from "./kontaktliste.ts";

// Anonymisierter WISO-Export (Datei 09, pdftotext -layout), Seiten wie in pdfPageTexts am Seitenvorschub getrennt:
// https://github.com/Speicherstadt/haben/issues/565#issuecomment-6770106423
const beispielSeiten = readFileSync(new URL("../../test-fixtures/wiso/kontaktliste-pdftotext.txt", import.meta.url), "utf8")
  .split("\f")
  .filter((seite) => seite.trim());

const page = (rows: string[], number = 1) =>
  [
    `Unternehmen / Firma Beispielbüro                                                     Seite ${number}`,
    "",
    "Kunden / Interessenten",
    "Name, Anschrift             Telefon          Kontaktdaten      Bankverbindung      Umsatz                    Notizen",
    ...rows,
    "                                                                                  Soweit im Einzelnen nicht anders vermerkt, Betragsangaben in Euro.",
  ].join("\n");

const kontakt = (number: string, name: string, postalLine = "12345 Musterstadt") => [
  `${number}, ${name.padEnd(22)}  k.A.             k.A.              k.A.                 Umsatz (netto): 0,00 €      k.A.`,
  "Beispielweg 1                                                                      Kreditlimit: 0,00 €",
  postalLine,
  "2. Anschrift",
  "k.A.",
];

describe("WISO-Kunden-/Interessentenliste", () => {
  it("liest alle zwölf Kontakte des anonymisierten WISO-Exports von drei Seiten", () => {
    const { contacts, warnings } = readWisoContactList(beispielSeiten);
    expect(contacts.map((c) => [c.number, c.page])).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3].map((seite, i) => [String(i + 1).padStart(4, "0"), seite]));
    expect(contacts.find((c) => c.number === "0003")).toMatchObject({
      name: "FM Fiktivholz Holzbaustatik GmbH & Co. KG",
      street: "Industriestraße 27",
      postalCode: "54321",
      city: "Beispieldorf",
      country: "DE",
    });
    expect(contacts.find((c) => c.number === "0008")).toMatchObject({ name: "XYZ Gewerbepark Beispiel-Süd GmbH & Co. KG", street: "Teststraße 15" });
    expect(contacts.filter((c) => c.country === null).map((c) => [c.number, c.postalCode, c.city])).toEqual([
      ["0007", "L - 1234", "Luxembourg"],
      ["0011", "L - 1821", "Luxembourg"],
    ]);
    // Ansprechpartner bei 0003 und 0008; Umsatz, Saldo und umbrochene Werte rechts lösen keinen Hinweis aus
    expect(warnings.filter((w) => w.includes("Zusatzangaben"))).toEqual([expect.stringMatching(/0003/), expect.stringMatching(/0008/)]);
  });

  it("liest Kontaktnummern und vollständige Namen über Seiten hinweg", () => {
    const [row, ...rest] = kontakt("0001", "Muster Beispiel");
    const result = readWisoContactList([page([row!, "mit langem Namen GmbH", ...rest]), page(kontakt("0002", "Andere Firma", "L - 1821 Luxembourg"), 2)]);
    expect(result.contacts).toEqual([
      {
        number: "0001",
        name: "Muster Beispiel mit langem Namen GmbH",
        street: "Beispielweg 1",
        postalCode: "12345",
        city: "Musterstadt",
        country: "DE",
        page: 1,
      },
      { number: "0002", name: "Andere Firma", street: "Beispielweg 1", postalCode: "L - 1821", city: "Luxembourg", country: null, page: 2 },
    ]);
    expect(result.warnings).toEqual([expect.stringMatching(/Seite 1.*0001.*Namensumbruch/), expect.stringMatching(/Seite 2.*0002.*Land prüfen/)]);
  });

  it("warnt bei Zusatzangaben außerhalb der CSV-Felder", () => {
    const rows = kontakt("0003", "Dritte Firma");
    rows.splice(3, 0, "Ansprechpartner: Frau Probe");
    rows[0] = rows[0]!.replace("k.A.", "1234");
    rows[rows.length - 1] = "Musterstraße 4";
    expect(readWisoContactList([page(rows)]).warnings).toEqual([expect.stringMatching(/Seite 1.*0003.*Zusatzangaben/)]);
  });

  it("weist unbekannte Seiten und unvollständige Kontaktzeilen zurück", () => {
    expect(() => readWisoContactList([page(kontakt("0001", "Beispiel")), ""])).toThrow(/Seite 2/);
    expect(() => readWisoContactList([page(kontakt("0001", "Beispiel", "???"))])).toThrow(/Seite 1.*0001.*Anschrift/);
    expect(() => readWisoContactList([page([...kontakt("0001", "Beispiel"), ...kontakt("0001", "Doppelt")])])).toThrow(/0001.*mehrfach/);
  });

  it("verliert bei breiteren Wortabständen weder Namensteile noch weitere Kontakte", () => {
    const rows = [...kontakt("0001", "Muster  GmbH"), ...kontakt("0002", " Zweite Firma")];
    const { contacts } = readWisoContactList([page(rows)]);
    expect(contacts.map(({ number, name }) => [number, name])).toEqual([
      ["0001", "Muster GmbH"],
      ["0002", "Zweite Firma"],
    ]);
  });

  it("weist abgeschnittene Kontakte und ausgelassene Seiten zurück", () => {
    expect(() => readWisoContactList([page([...kontakt("0001", "Beispiel"), "0002,"])])).toThrow(/Seite 1.*0002.*Name/);
    expect(() => readWisoContactList([page(kontakt("0001", "Beispiel")).replace("Seite 1", "Seite 2")])).toThrow(/Seite 1.*Seitennummer/);
  });
});
