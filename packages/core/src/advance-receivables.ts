import type { Cents } from "./money.ts";

/** Nur festgeschriebene Belege mit dem neuen Bilanzverfahrensmarker; Altbelege liefert der Aufrufer nicht hierher. */
export interface DeferredInvoice {
  id: string;
  correctsId: string | null;
  replacesInvoiceId: string | null;
  kind: "rechnung" | "korrektur" | "storno";
  variant: "abschlag" | "schluss" | null;
  advanceType: "anzahlung" | "teilleistung" | null;
  number: string;
  party: string;
  issueDate: string;
  dueDate: string;
  performanceDate: string;
  gross: Cents;
}

export interface DeferredSettlement {
  invoiceId: string;
  date: string;
  amount: Cents;
  /** Gespeicherter Nettoanteil; nicht aus einem Steuersatz neu runden. */
  net: Cents;
  kind: "payment" | "writeOff";
}

export interface DeferredDeduction {
  invoiceId: string;
  advanceId: string;
}

export interface AdvanceReceivablePosition {
  id: string;
  originId: string;
  number: string;
  party: string;
  date: string;
  dueDate: string;
  gross: Cents;
  open: Cents;
  kind: "request" | "receivable" | "unbilled" | "refund";
}

export interface AdvanceReceivables {
  positions: AdvanceReceivablePosition[];
  /** Herkunftsumfang des gesonderten Journalabgleichs, keine Vereinigung nach Betrag oder Kundenname. */
  invoiceIds: string[];
  receivables: Cents;
  requests: Cents;
  unbilled: Cents;
  netAdvances: Cents;
}

function origin(invoice: DeferredInvoice, byId: ReadonlyMap<string, DeferredInvoice>): DeferredInvoice {
  const seen = new Set<string>();
  let current = invoice;
  while (current.correctsId || current.replacesInvoiceId) {
    if (seen.has(current.id)) throw new RangeError("Die Rechnungskette ist nicht eindeutig.");
    seen.add(current.id);
    const parent = byId.get((current.correctsId ?? current.replacesInvoiceId)!);
    if (!parent) throw new RangeError("Der Ursprung der Rechnungskette fehlt.");
    current = parent;
  }
  return current;
}

function replacementDepth(invoice: DeferredInvoice, byId: ReadonlyMap<string, DeferredInvoice>): number {
  let depth = 0;
  let current = invoice;
  while (current.replacesInvoiceId) {
    current = byId.get(current.replacesInvoiceId)!;
    depth++;
  }
  return depth;
}

function paperAt(members: readonly DeferredInvoice[], cutoff: string, byId: ReadonlyMap<string, DeferredInvoice>) {
  return members
    .filter((i) => i.kind === "rechnung" && i.issueDate <= cutoff)
    .sort((a, b) => replacementDepth(a, byId) - replacementDepth(b, byId))
    .at(-1);
}

function position(
  original: DeferredInvoice,
  paper: DeferredInvoice | undefined,
  kind: AdvanceReceivablePosition["kind"],
  gross: Cents,
  open: Cents,
): AdvanceReceivablePosition {
  const source = paper ?? original;
  return {
    id: source.id,
    originId: original.id,
    number: source.number,
    party: source.party,
    date: paper ? paper.issueDate : original.performanceDate,
    dueDate: source.dueDate,
    gross,
    open,
    kind,
  };
}

function requestAt(
  original: DeferredInvoice,
  adjustments: readonly DeferredInvoice[],
  paper: DeferredInvoice | undefined,
  settled: Cents,
  cutoff: string,
): AdvanceReceivablePosition | null {
  if (original.issueDate > cutoff) return null;
  const gross = original.gross + adjustments.reduce((sum, i) => sum + i.gross, 0);
  const open = gross - settled;
  if (!open) return null;
  const source = paper ?? original;
  const cancellation = adjustments.find((i) => i.kind === "storno" && i.correctsId === source.id);
  return position(original, open < 0 ? (cancellation ?? source) : source, open < 0 ? "refund" : "request", open < 0 ? -original.gross : gross, open);
}

function claimAt(
  original: DeferredInvoice,
  adjustments: readonly DeferredInvoice[],
  paper: DeferredInvoice | undefined,
  settled: Cents,
  cancelled: boolean,
): AdvanceReceivablePosition | null {
  const gross = original.gross + adjustments.reduce((sum, i) => sum + i.gross, 0);
  const open = gross - settled;
  if (!open) return null;
  const kind = original.variant === null && open < 0 ? "refund" : !paper || cancelled ? "unbilled" : "receivable";
  return position(original, paper, kind, gross, open);
}

/**
 * Stichtagsstand aus Belegen und datierten Erledigungen, ohne Journal: § 252 Abs. 1 Nr. 4/5 HGB.
 * Vor Leistung nur tatsächlich erhaltenes Netto als Anzahlungsverbindlichkeit, offene Anforderungen getrennt.
 * Rechnungsaustausch nimmt keine Leistung zurück; zukünftige Zahlungen und Papierbelege ziehen den Stand nicht vor.
 * Quellen: https://www.gesetze-im-internet.de/hgb/__252.html und bestätigter Ablauf in #750.
 */
export function advanceReceivables(
  invoices: readonly DeferredInvoice[],
  settlements: readonly DeferredSettlement[],
  deductions: readonly DeferredDeduction[],
  cutoff: string,
): AdvanceReceivables {
  const result: AdvanceReceivables = { positions: [], invoiceIds: invoices.map((i) => i.id).sort(), receivables: 0, requests: 0, unbilled: 0, netAdvances: 0 };
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const origins = new Map(invoices.map((i) => [i.id, origin(i, byId).id]));
  const payments = settlements.filter((s) => s.date <= cutoff);
  for (const original of invoices.filter((i) => !i.correctsId && !i.replacesInvoiceId)) {
    const members = invoices.filter((i) => origins.get(i.id) === original.id);
    const paid = payments.filter((s) => origins.get(s.invoiceId) === original.id);
    const settled = paid.reduce((sum, s) => sum + s.amount, 0);
    const paper = paperAt(members, cutoff, byId);
    const dated = members.filter((i) => i.id !== original.id && i.issueDate <= cutoff);
    // Ein festgeschriebener Ersatz belegt, dass der Anspruch auch zwischen Storno und Ersatz bestehen blieb (#1454).
    // Nur Nummer und Fälligkeit richten sich weiter nach dem Beleg am Stichtag.
    const replaced = new Set(members.map((i) => i.replacesInvoiceId).filter((id) => id !== null));
    const adjustments = original.variant === null ? dated.filter((i) => !i.replacesInvoiceId && !(i.kind === "storno" && replaced.has(i.correctsId!))) : dated;
    const cancellation = dated.find((i) => i.kind === "storno" && i.correctsId === (paper?.id ?? original.id));
    const isAdvance = original.advanceType === "anzahlung";
    const performed = isAdvance
      ? deductions.some(
          (d) =>
            d.advanceId === original.id &&
            byId.get(d.invoiceId)?.variant === "schluss" &&
            !byId.get(d.invoiceId)!.replacesInvoiceId &&
            byId.get(d.invoiceId)!.performanceDate <= cutoff,
        )
      : original.performanceDate <= cutoff &&
        !(original.variant === null && cancellation && !replaced.has(cancellation.correctsId!) && cancellation.issueDate <= original.performanceDate);
    if (!performed) result.netAdvances += paid.filter((s) => s.kind === "payment").reduce((sum, s) => sum + s.net, 0);
    const row = performed
      ? claimAt(original, original.variant === "schluss" ? dated.filter((i) => i.kind === "korrektur") : adjustments, paper, settled, !!cancellation)
      : requestAt(original, adjustments, original.variant === null ? paper : undefined, settled, cutoff);
    if (!row) continue;
    result.positions.push(row);
    if (row.kind === "request") result.requests += row.open;
    if (row.kind === "receivable" || row.kind === "unbilled" || (row.kind === "refund" && performed)) result.receivables += row.open;
    if (row.kind === "unbilled") result.unbilled += row.open;
  }
  result.positions.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  return result;
}
