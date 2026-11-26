import { WisoParseError } from "./types.ts";

export interface WisoListContact {
  number: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: "DE" | null;
  page: number;
}

const COLUMNS = /^\s*Name, Anschrift +(Telefon) +Kontaktdaten +Bankverbindung +(Umsatz) +(Notizen)\s*$/d;
const CONTACT_START = /^(\d+),\s+(\S.*)$/;
const POSTAL_LINE = /^((?:[A-Za-z]+(?: *[-–] *| +))?\d[\dA-Za-z-]*) +(\S.*)$/;
const populated = (value: string) => Boolean(value && value !== "k.A.");

type ContactBlock = { number: string; firstNameLine: string; lines: string[]; extraColumns: boolean };

function unpackContact(block: ContactBlock, page: number, warnings: string[]): WisoListContact {
  const place = `Seite ${page}, Nr. ${block.number}`;
  const secondary = block.lines.indexOf("2. Anschrift");
  if (secondary < 0) throw new WisoParseError(`${place}: Angaben zur Anschrift sind unvollständig.`);

  const primary = block.lines.slice(0, secondary);
  const reference = primary.findIndex((line) => line.startsWith("Ansprechpartner:"));
  const address = reference < 0 ? primary : primary.slice(0, reference);
  const postal = POSTAL_LINE.exec(address.at(-1) ?? "");
  const street = address.at(-2);
  if (!postal || !street || !/\d/.test(street)) throw new WisoParseError(`${place}: Anschrift nicht eindeutig erkannt.`);

  const [, postalCode, city] = postal;
  const country = /^\d{5}$/.test(postalCode!) ? "DE" : null;
  if (!country) warnings.push(`${place}: Land prüfen und PLZ ergänzen.`);
  const nameLines = [block.firstNameLine, ...address.slice(0, -2)];
  if (nameLines.length > 1) warnings.push(`${place}: Namensumbruch mit dem PDF vergleichen.`);
  if (reference >= 0 || block.extraColumns || block.lines.slice(secondary + 1).some(populated)) {
    warnings.push(`${place}: Zusatzangaben im PDF prüfen. Sie stehen außerhalb der übernommenen Felder.`);
  }
  return { number: block.number, name: nameLines.join(" "), street, postalCode: postalCode!, city: city!, country, page };
}

function readPage(text: string, page: number, warnings: string[]): WisoListContact[] {
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((line) => COLUMNS.test(line));
  const columns = COLUMNS.exec(lines[header] ?? "")?.indices;
  const heading = lines.slice(0, header);
  if (!columns || !heading.some((line) => line.trim() === "Kunden / Interessenten")) {
    throw new WisoParseError(`Seite ${page}: Keine WISO-Liste „Kunden / Interessenten“ erkannt.`);
  }
  const printedPage = heading.map((line) => /\bSeite +(\d+)\s*$/.exec(line)?.[1]).find(Boolean);
  if (printedPage && Number(printedPage) !== page)
    throw new WisoParseError(`Seite ${page}: Gedruckte Seitennummer ${printedPage} passt nicht zur PDF-Reihenfolge.`);
  const phone = columns[1]![0];
  const turnover = columns[2]![0];
  const notes = columns[3]![0];
  const contacts: WisoListContact[] = [];
  let block: ContactBlock | undefined;
  for (const line of lines.slice(header + 1)) {
    if (line.trimStart().startsWith("Soweit im Einzelnen nicht anders vermerkt")) continue;
    const cells = [...line.trimEnd().matchAll(/\S(?:.*?\S)?(?= {2,}|$)/g)];
    // Wortabstände innerhalb einer PDF-Spalte können ebenfalls mehrere Leerzeichen breit sein.
    const first = cells
      .filter((cell) => cell.index < phone)
      .map((cell) => cell[0])
      .join(" ");
    const right = cells.some((cell) => cell.index >= phone && (cell.index < turnover || cell.index >= notes) && populated(cell[0]));
    const start = CONTACT_START.exec(first);
    if (!start && /^\d+,/.test(first)) throw new WisoParseError(`Seite ${page}, Nr. ${first.split(",")[0]}: Name fehlt oder ist nicht lesbar.`);
    if (start) {
      if (block) contacts.push(unpackContact(block, page, warnings));
      block = { number: start[1]!, firstNameLine: start[2]!, lines: [], extraColumns: right };
    } else if (block) {
      if (first) block.lines.push(first);
      block.extraColumns ||= right;
    } else if (cells.length) {
      throw new WisoParseError(`Seite ${page}: Zeile ohne erkennbare Kontaktnummer.`);
    }
  }
  if (block) contacts.push(unpackContact(block, page, warnings));
  if (!contacts.length) throw new WisoParseError(`Seite ${page}: Keine Kontakte erkannt.`);
  return contacts;
}

/**
 * Format aus dem anonymisierten WISO-Textexport in #565. Das Land fehlt im PDF.
 * Fünfstellige PLZ erhalten DE als Vorschlag; Präfixe bleiben zur Prüfung erhalten:
 * https://github.com/Speicherstadt/haben/issues/565#issuecomment-6770106423
 * https://github.com/Speicherstadt/haben/issues/565#issuecomment-6808458708
 */
export function readWisoContactList(pages: string[]): { contacts: WisoListContact[]; warnings: string[] } {
  const warnings: string[] = [];
  const contacts = pages.flatMap((page, index) => readPage(page, index + 1, warnings));
  if (!contacts.length) throw new WisoParseError("Keine WISO-Kontakte erkannt.");
  const numbers = new Set<string>();
  for (const contact of contacts) {
    if (numbers.has(contact.number)) throw new WisoParseError(`Kontaktnummer ${contact.number} kommt im PDF mehrfach vor.`);
    numbers.add(contact.number);
  }
  return { contacts, warnings };
}
