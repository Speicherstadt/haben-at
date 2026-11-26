import { invoicePosting, legacyCorrectionPosting, type InvoiceTotals, type Kontenrahmen, type PostingLine } from "@haben/core";
import { and, eq } from "drizzle-orm";
import { schema, type Db, type Tx } from "../../db/index.ts";
import { type openBooks, post, reverseLinesIn } from "../buchhaltung/index.ts";
import { advanceInvoicePosting } from "./advance-invoice.ts";
import { normalReplacementId } from "./invoice-replacement.ts";
import { invoicePostingMode, invoiceVatDate } from "./invoice-tax.ts";
import type { Invoice } from "./invoices.ts";

/** Die Rechnung dokumentiert dieselbe Leistung. Nur die bereits gebuchten Zeilen ihres Papierstornos ausgleichen. */
async function restorePaperCancellation(tx: Tx, books: Awaited<ReturnType<typeof openBooks>>, replacementId: string, replacedId: string, description: string) {
  const { invoices, journalEntries, journalLines } = schema;
  const entries = await tx
    .select({ entry: journalEntries })
    .from(invoices)
    .innerJoin(journalEntries, and(eq(journalEntries.sourceType, "invoice"), eq(journalEntries.sourceId, invoices.id)))
    .where(and(eq(invoices.correctsId, replacedId), eq(invoices.kind, "storno"), eq(invoices.status, "final")));
  for (const { entry } of entries) {
    const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, entry.id));
    await post(tx, books, {
      date: entry.date,
      description: `Rechnungsaustausch · ${description}`,
      sourceType: "invoice",
      sourceId: replacementId,
      reversesId: entry.id,
      lines: reverseLinesIn(
        entry.kontenrahmen as Kontenrahmen,
        books.kontenrahmen,
        lines.map((line) => ({
          account: line.account,
          debit: line.debit,
          credit: line.credit,
          taxCode: line.taxCode as PostingLine["taxCode"],
          basis: line.basis,
        })),
      ),
    });
  }
}

/** Bucht die festgeschriebene Rechnung: Abschläge mit Verfahren „deferred“ eigens, sonst Erlös und Umsatzsteuer */
export async function postInvoice(
  tx: Tx,
  invoice: Invoice,
  totals: InvoiceTotals,
  company: Awaited<ReturnType<typeof openBooks>>,
  corrects: Invoice | undefined,
  description: string,
): Promise<void> {
  const replacedId = normalReplacementId(invoice);
  if (replacedId) return restorePaperCancellation(tx, company, invoice.id, replacedId, description);
  const versteuerung = await invoicePostingMode(invoice, tx);
  const bookings =
    invoice.advanceAccounting === "deferred"
      ? await advanceInvoicePosting(invoice, totals, company.kontenrahmen, tx)
      : [
          {
            date: await invoiceVatDate(invoice, tx),
            // Übernommene Erlöse stehen in den alten Büchern; auch spätere Korrektur-Stornos folgen deren Ursprung.
            lines: (await correctsLegacyInvoice(tx, corrects))
              ? legacyCorrectionPosting(totals, company.kontenrahmen, versteuerung)
              : invoicePosting(totals, company.kontenrahmen, versteuerung, invoice.taxTreatment),
          },
        ];
  for (const booking of bookings)
    if (booking.lines.length)
      await post(tx, company, {
        date: booking.date,
        description,
        sourceType: "invoice",
        sourceId: invoice.id,
        lines: booking.lines,
      });
}

/** Korrigiert die Rechnung (über Korrekturen hinweg) eine aus Lexoffice übernommene? Dann gehören ihre Erlöse zu den alten Büchern */
async function correctsLegacyInvoice(q: Db | Tx, corrects: Invoice | undefined): Promise<boolean> {
  let current = corrects;
  for (let depth = 0; current && depth < 20; depth++) {
    if (current.lexofficeVoucherId) return true;
    if (!current.correctsId) return false;
    [current] = await q.select().from(schema.invoices).where(eq(schema.invoices.id, current.correctsId));
  }
  return false;
}
