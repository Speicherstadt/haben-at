import { vatTerritory } from "@haben/core";

/** Ruhiger Prüfhinweis; die PLZ ändert weder eine Behandlung noch die Festschreibungsprüfung. */
export function VatTerritoryHint({ id, country, postalCode }: { id: string; country?: string; postalCode?: string }) {
  const territory = vatTerritory(country, postalCode);
  if (!territory) return null;
  return (
    <p id={id} className="field-hint" role="status" style={{ margin: 0, gridColumn: "1 / -1" }}>
      {territory}: umsatzsteuerlich Drittland. Anschrift und gewählte Umsatzsteuer-Behandlung prüfen.
    </p>
  );
}
