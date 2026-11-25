/*
 * Welche Monate in der StorePayoutBox gewählt sind. Eigene Datei, damit der Test die Serverfunktionen nicht lädt.
 */

type Monat = { id: string; suggested: boolean };
export type Auswahl = { angebot: string; ids: ReadonlySet<string> };

const angebotVon = (months: readonly Monat[]) => months.map((m) => m.id).join(",");

/**
 * Die gewählten Monate. Eine Auswahl gilt nur für das Angebot, zu dem sie getroffen wurde: Der Router zeigt erst das
 * vorgeladene Detail und lädt dann neu; nennt das neue Angebot andere Monate, gilt wieder sein Vorschlag.
 */
export function auswahlFuer(months: readonly Monat[], auswahl: Auswahl | null): ReadonlySet<string> {
  if (auswahl?.angebot === angebotVon(months)) return auswahl.ids;
  return new Set(months.filter((m) => m.suggested).map((m) => m.id));
}

/** Die Auswahl nach dem An- oder Abhaken eines Monats */
export function umgeschaltet(months: readonly Monat[], auswahl: Auswahl | null, id: string): Auswahl {
  const ids = new Set(auswahlFuer(months, auswahl));
  if (!ids.delete(id)) ids.add(id);
  return { angebot: angebotVon(months), ids };
}
