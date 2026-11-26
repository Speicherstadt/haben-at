import { describe, expect, it } from "vitest";
import { treatmentIssues } from "./treatment.ts";
import { vatTerritory } from "./vat-territories.ts";

describe("Sondergebiete im Umsatzsteuerrecht", () => {
  it.each([
    ["DE", "27498", "Helgoland"],
    ["DE", "78266", "Büsingen"],
    ["ES", "35001", "Kanarische Inseln"],
    ["ES", "38001", "Kanarische Inseln"],
    ["ES", "51001", "Ceuta"],
    ["ES", "52001", "Melilla"],
    ["IT", "23041", "Livigno"],
    ["IT", "22061", "Campione d’Italia"],
    ["GR", "63086", "Berg Athos"],
    ["GR", "63087", "Berg Athos"],
  ])("erlaubt eine ausdrücklich gewählte Ausfuhr nach %s %s (%s)", (buyerCountry, buyerPostalCode) => {
    const destination = { buyerCountry, buyerPostalCode };
    expect(treatmentIssues("ausfuhr", { rates: [0], sellerUstId: "DE123456789", ...destination })).toEqual([]);
  });

  it("behandelt eine ausdrücklich gewählte Drittlandleistung nach Helgoland nicht pauschal als Inland", () => {
    const destination = { buyerCountry: "DE", buyerPostalCode: "27498" };
    expect(treatmentIssues("drittland", { rates: [0], ...destination })).toEqual([]);
  });

  it.each([
    ["DE", "27498", "Helgoland"],
    ["DE", "78266", "Büsingen"],
    ["CH", "8238", "Büsingen"],
    ["ES", "35001", "Kanarische Inseln"],
    ["ES", "38917", "Kanarische Inseln"],
    ["ES", "51001", "Ceuta"],
    ["ES", "52001", "Melilla"],
    ["IT", "23041", "Livigno / Trepalle"],
    ["IT", "22061", "Campione d’Italia"],
    ["GR", "630 86", "Berg Athos"],
    ["GR", "63087", "Berg Athos"],
  ])("benennt den unverbindlichen Hinweis für %s %s", (country, postcode, name) => {
    expect(vatTerritory(country, postcode)).toBe(name);
  });

  it.each([
    ["DE", "10115"],
    ["DE", "27499"],
    ["DE", "8238"],
    ["CH", "8239"],
    ["ES", "28001"],
    ["IT", "20121"],
    ["GR", "10557"],
    ["ES", "38"],
    ["ES", "380010"],
    ["ES", "38abc"],
    ["FR", "38001"],
    ["IT", "23030"],
    ["IT", "22060"],
    ["GR", "63088"],
    ["DE", ""],
    ["ES", ""],
    ["IT", ""],
    ["GR", ""],
    ["", "38001"],
  ])("erfindet keine Sondergebietszuordnung für %s %s (auch keine Seegewässer aus einer Ufer-PLZ)", (country, postcode) => {
    expect(vatTerritory(country, postcode)).toBeNull();
  });

  it("belässt bewusst gewählte IGL und reguläre Behandlung trotz PLZ, verlangt aber weiterhin Pflichtangaben", () => {
    const destination = { buyerCountry: "ES", buyerPostalCode: "38001" };
    expect(treatmentIssues("ig_lieferung", { rates: [0], sellerUstId: "DE123456789", buyerUstId: "ESB12345678", ...destination })).toEqual([]);
    expect(treatmentIssues("regulaer", { rates: [1900], ...destination })).toEqual([]);
    expect(treatmentIssues("ig_lieferung", { rates: [0], ...destination })).toHaveLength(2);
    expect(treatmentIssues("ausfuhr", { rates: [1900], ...destination })).toHaveLength(2);
  });

  it("belässt gewöhnliche Anschriften, fehlende PLZ, Monaco und Nordirland in ihren bisherigen Prüfwegen", () => {
    for (const [buyerCountry, buyerPostalCode] of [
      ["DE", "10115"],
      ["ES", "28001"],
      ["IT", "20121"],
      ["GR", "10557"],
      ["MC", "98000"],
      ["ES", ""],
    ]) {
      expect(treatmentIssues("ausfuhr", { rates: [0], sellerUstId: "DE123456789", buyerCountry, buyerPostalCode })).toHaveLength(1);
    }
    expect(
      treatmentIssues("ig_lieferung", { rates: [0], sellerUstId: "DE123456789", buyerUstId: "XI123456789", buyerCountry: "GB", buyerPostalCode: "BT1 1AA" }),
    ).toEqual([]);
  });
});
