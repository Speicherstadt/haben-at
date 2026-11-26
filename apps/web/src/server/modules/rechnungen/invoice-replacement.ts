import { leistungsdatum } from "@haben/core";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { schema, type Db, type Tx } from "../../db/index.ts";
import { InvoiceError } from "./invoice-error.ts";
import type { Invoice } from "./invoices.ts";
import { paidByTarget } from "./zahlungsstand.ts";

/** Die Spalte ist auch Teil des bisherigen Schlussrechnungsverfahrens. Hier geht es nur um normale Rechnungen. */
export function normalReplacementId(invoice: Pick<Invoice, "variant" | "replacesInvoiceId">) {
  return invoice.variant === null ? invoice.replacesInvoiceId : null;
}

export function replacementDraftProblem(original: Invoice | undefined, id: string | null, kind: Invoice["kind"], variant: Invoice["variant"]) {
  if (kind !== "rechnung" || variant !== null) return "Nur eine normale Rechnung kann ausdrücklich eine frühere Rechnung ersetzen";
  if (!original || original.id === id || original.kind !== "rechnung" || original.variant !== null || original.status !== "final") {
    return "Für den Rechnungsaustausch eine festgeschriebene normale Rechnung wählen";
  }
  return null;
}

function previousPerformance(original: Invoice) {
  return original.serviceDate ?? original.issueDate;
}

/** Der alte Leistungsstand gilt weiter, auch wenn auf der alten Rechnung kein Leistungszeitraum stand. */
export function replacementPerformanceDate(invoice: Invoice, original?: Invoice) {
  return original
    ? previousPerformance(original)
    : leistungsdatum({ belegdatum: invoice.issueDate, leistungVon: invoice.serviceFrom, leistungBis: invoice.serviceTo });
}

function samePerformance(invoice: Invoice, original: Invoice): boolean {
  if (original.serviceFrom || original.serviceTo) {
    return invoice.serviceFrom === original.serviceFrom && invoice.serviceTo === original.serviceTo;
  }
  return (
    (!invoice.serviceFrom && !invoice.serviceTo) ||
    ((!invoice.serviceFrom || invoice.serviceFrom === previousPerformance(original)) &&
      (!invoice.serviceTo || invoice.serviceTo === previousPerformance(original)))
  );
}

async function sameTaxShares(invoice: Invoice, original: Invoice, q: Db | Tx): Promise<boolean> {
  const { invoiceId, rate, base, tax, originalBase, originalTax } = schema.invoiceTaxes;
  const rows = await q
    .select({ invoiceId, rate, base, tax, originalBase, originalTax })
    .from(schema.invoiceTaxes)
    .where(inArray(invoiceId, [invoice.id, original.id]))
    .orderBy(asc(rate));
  const before = rows.filter((row) => row.invoiceId === original.id);
  const after = rows.filter((row) => row.invoiceId === invoice.id);
  return (
    before.length > 0 &&
    before.length === after.length &&
    before.every(
      (row, i) =>
        row.rate === after[i]!.rate &&
        row.base === after[i]!.base &&
        row.tax === after[i]!.tax &&
        row.originalBase === after[i]!.originalBase &&
        row.originalTax === after[i]!.originalTax,
    )
  );
}

/** Prüft sowohl die Vorschau als auch die Festschreibung unter der Sperre des Vorgängers. */
export async function replacementProblem(invoice: Invoice, original: Invoice | undefined, q: Db | Tx): Promise<string | null> {
  const invalidDraft = replacementDraftProblem(original, invoice.id, invoice.kind, invoice.variant);
  if (invalidDraft || !original) return invalidDraft;
  const previous = await q
    .select({ id: schema.invoices.id, kind: schema.invoices.kind, issueDate: schema.invoices.issueDate, replacesId: schema.invoices.replacesInvoiceId })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.status, "final"),
        // Ein endgültiges Storno muss vorliegen; ein weiterer Ersatz darf den Vorgänger nicht nochmals ersetzen.
        or(eq(schema.invoices.replacesInvoiceId, original.id), eq(schema.invoices.correctsId, original.id)),
      ),
    );
  const cancellation = previous.find((row) => row.kind === "storno");
  if (!cancellation) return "Die bisherige Rechnung muss zuerst storniert werden";
  if (previous.some((row) => row.replacesId === original.id && row.id !== invoice.id)) return "Die bisherige Rechnung wurde bereits ersetzt";
  if (previous.some((row) => row.kind === "korrektur")) return "Eine bestehende Rechnungskorrektur muss vor dem Austausch fachlich geklärt werden";
  if (invoice.issueDate < cancellation.issueDate) return "Das Rechnungsdatum des Ersatzes darf nicht vor dem Storno liegen";
  const year = Number(cancellation.issueDate.slice(0, 4));
  const [closed] = await q.select({ year: schema.yearClosings.year }).from(schema.yearClosings).where(eq(schema.yearClosings.year, year));
  if (closed) return `Das Storno liegt im abgeschlossenen Jahr ${year}. Der Rechnungsaustausch muss im Abschluss dieses Jahres geklärt werden`;
  if (invoice.quoteId !== original.quoteId) return "Der Rechnungsaustausch muss sich auf dasselbe Angebot beziehen";
  const settled = await paidByTarget("invoice_id", [cancellation.id], q);
  if ((settled.get(cancellation.id) ?? 0) !== 0) return "Eine erstattete oder verrechnete Stornorechnung lässt sich nicht durch diese Rechnung ersetzen";
  if (
    invoice.contactId !== original.contactId ||
    invoice.currency !== original.currency ||
    invoice.taxTreatment !== original.taxTreatment ||
    JSON.stringify(invoice.taxDetails) !== JSON.stringify(original.taxDetails) ||
    !samePerformance(invoice, original)
  ) {
    return "Kunde, Steuerbehandlung, Währung und Leistungszeitraum müssen mit der ersetzten Rechnung übereinstimmen";
  }
  if (!(await sameTaxShares(invoice, original, q))) {
    return "Die Beträge je Steuersatz müssen mit der ersetzten Rechnung übereinstimmen; eine Entgeltänderung braucht eine eigene Korrektur";
  }
  return null;
}

export async function loadReplacement(invoice: Invoice, q: Db | Tx) {
  const id = normalReplacementId(invoice);
  const [original] = id ? await q.select().from(schema.invoices).where(eq(schema.invoices.id, id)) : [];
  return original;
}

/** Beim Speichern vor dem ersten Audit-Eintrag sperren, wie Korrektur- und Abschlagsbezüge. */
export function replacementQuote(
  original: Invoice | undefined,
  id: string | null,
  kind: Invoice["kind"],
  variant: Invoice["variant"],
  quoteId: string | null | undefined,
) {
  const problem = replacementDraftProblem(original, id, kind, variant);
  if (problem || !original) throw new InvoiceError(problem ?? "Die ersetzte Rechnung fehlt");
  if (quoteId && quoteId !== original.quoteId) throw new InvoiceError("Der Rechnungsaustausch muss sich auf dasselbe Angebot beziehen.");
  return original.quoteId;
}
