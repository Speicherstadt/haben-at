import { sql, inArray } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "../../db/index.ts";
import { invoiceTaxReader } from "./invoice-tax.ts";

/**
 * Zahlungszeilen bleiben auf dem Beleg, dem sie ursprünglich zugeordnet wurden. Ein normaler Ersatz sieht seine
 * Vorgänger; beim Schlussbeleg gehört die ganze abschließend verbundene Kette zum bisherigen Verfahren.
 * Entscheidungen: #1454 und https://github.com/Speicherstadt/haben/issues/750#issuecomment-6837873675
 */
export async function invoicePaymentGroups(ids: string[], q: Db | Tx = db, includeNormalSuccessors = false): Promise<Map<string, string[]>> {
  const result = new Map(ids.map((id) => [id, [id]]));
  if (!ids.length) return result;
  const rows = await q.execute<{ target_id: string; id: string }>(sql`with recursive parents(target_id,id,replaces_invoice_id) as (
    select id,id,replaces_invoice_id from invoices where id in ${[...result.keys()]}
      and status='final' and kind='rechnung' and variant='schluss' and advance_accounting='deferred'
    union select p.target_id,i.id,i.replaces_invoice_id from parents p join invoices i on i.id=p.replaces_invoice_id
  ), groups(target_id,id) as (
    select target_id,id from parents where replaces_invoice_id is null
    union select g.target_id,i.id from groups g join invoices i on i.replaces_invoice_id=g.id
      where i.status='final' and i.kind='rechnung' and i.advance_accounting='deferred'
  ), normal(target_id,id,replaces_invoice_id) as (
    select id,id,replaces_invoice_id from invoices where id in ${[...result.keys()]}
      and status='final' and kind='rechnung' and variant is null and (replaces_invoice_id is not null or ${includeNormalSuccessors})
    union select n.target_id,i.id,i.replaces_invoice_id from normal n join invoices i on i.id=n.replaces_invoice_id
      where i.status='final' and i.kind='rechnung' and i.variant is null
  ), normalSuccessors(target_id,id) as (
    select target_id,id from normal where replaces_invoice_id is null and ${includeNormalSuccessors}
    union select n.target_id,i.id from normalSuccessors n join invoices i on i.replaces_invoice_id=n.id
      where i.status='final' and i.kind='rechnung' and i.variant is null
  ) select target_id,id from groups union select target_id,id from normal union select target_id,id from normalSuccessors order by target_id,id`);
  const grouped = new Map<string, string[]>();
  for (const { target_id, id } of rows) grouped.set(target_id, [...(grouped.get(target_id) ?? []), id]);
  for (const [id, group] of grouped) result.set(id, group);
  return result;
}

export async function invoicePaymentGroup(id: string, q: Db | Tx = db): Promise<string[]> {
  return (await invoicePaymentGroups([id], q)).get(id)!;
}

/** Kein Erstattungsanspruch bei einem Schluss-Papierstorno oder ab dem endgültigen Ersatz einer normalen Rechnung. */
export async function paperCancellationIds(ids: string[], q: Db | Tx = db): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const replaced = await q.execute<{ id: string }>(sql`
    select s.id from invoices s
    where s.id in ${ids} and s.kind='storno' and s.status='final'
      and exists (select 1 from invoices r where r.replaces_invoice_id=s.corrects_id
        and r.kind='rechnung' and r.variant is null and r.status='final')`);
  const result = new Set([...replaced].map(({ id }) => id));
  const invoices = await q.select().from(schema.invoices).where(inArray(schema.invoices.id, ids));
  const taxes = invoiceTaxReader(q);
  for (const invoice of invoices) {
    if (invoice.kind !== "storno" || invoice.advanceAccounting !== "deferred") continue;
    if ((await taxes.original(invoice)).variant === "schluss") result.add(invoice.id);
  }
  return result;
}
