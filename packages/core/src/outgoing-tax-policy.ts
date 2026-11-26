import { inEuVatArea, type TaxTreatment } from "./treatment.ts";
import type { OutgoingTaxDetails } from "./outgoing-tax.ts";
import { vatTerritory } from "./vat-territories.ts";

/**
 * Gemeinsame Firmen-/Belegregel für Rechnung, Angebot, Serie und API; die sachlichen Voraussetzungen
 * der gewählten Befreiung beurteilt der Unternehmer. § 19 Abs. 1 Satz 2 und § 3a UStG:
 * https://www.gesetze-im-internet.de/ustg_1980/__19.html
 * https://www.gesetze-im-internet.de/ustg_1980/__3a.html
 * Das Umsatzsteuergebiet schließt Monaco ein (§ 1 Abs. 2a UStG), auch beim ausdrücklich erfassten Leistungsort:
 * https://www.gesetze-im-internet.de/ustg_1980/__1.html
 */
export function outgoingTaxIssues(treatment: TaxTreatment, details: OutgoingTaxDetails | null | undefined, kleinunternehmer: boolean): string[] {
  const issues: string[] = [];
  const place = details?.foreignPlace;
  // Nur der ausdrücklich erfasste tatsächliche Ort zählt hier, niemals die Anschrift des Kunden.
  const territory = vatTerritory(place?.country, place?.postalCode);
  const euForeignPlace = place && place.country !== "DE" && inEuVatArea(place.country) && !territory;
  const foreignConfirmed = Boolean(
    place && /^[A-Z]{2}$/.test(place.country) && (place.country !== "DE" || (treatment === "drittland" && territory)) && place.noForeignVat,
  );
  if (place && ((treatment === "reverse_charge" && !euForeignPlace) || (treatment === "drittland" && inEuVatArea(place.country) && !territory))) {
    issues.push("Der tatsächliche Leistungsort passt nicht zur gewählten EU-/Drittland-Behandlung");
  }
  if (treatment === "eu_sonstige" && (!foreignConfirmed || !euForeignPlace)) {
    issues.push(
      "Für die sonstige EU-Leistung bitte den tatsächlichen Leistungsort im EU-Ausland und die Behandlung ohne auszuweisende ausländische Umsatzsteuer bestätigen",
    );
  }
  if (kleinunternehmer) {
    const exemption = details?.exemption;
    const allowedExemption = (exemption?.number === "14" && exemption.letter === "a") || (exemption?.number === "21" && !exemption.letter);
    if (treatment === "steuerfrei" && !allowedExemption) {
      issues.push("Als Kleinunternehmer bitte die eigene Vorschrift § 4 Nr. 14 Buchst. a oder Nr. 21 strukturiert zuordnen; alter Freitext bleibt ungeklärt");
    } else if ((treatment === "reverse_charge" || treatment === "drittland") && !foreignConfirmed) {
      issues.push(
        "Als Kleinunternehmer bitte den tatsächlichen ausländischen Leistungsort und die Behandlung ohne auszuweisende ausländische Umsatzsteuer bestätigen",
      );
    } else if (treatment === "regulaer" || treatment === "ig_lieferung" || treatment === "ausfuhr") {
      issues.push("Als Kleinunternehmer bitte § 19, eine unterstützte eigene Befreiung oder einen geklärten ausländischen Leistungsort wählen");
    }
  } else if (treatment === "drittland" && territory && !foreignConfirmed) {
    issues.push("Für den tatsächlichen Leistungsort im Sondergebiet bitte die Behandlung ohne auszuweisende ausländische Umsatzsteuer bestätigen");
  } else if (treatment === "kleinunternehmer") {
    issues.push("Kleinunternehmer ist in den Einstellungen nicht eingeschaltet");
  }
  return issues;
}
