import { sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/index.ts";
import { BankError } from "./bank-error.ts";

type ReassignmentSource = { id: string; date: string; remaining: number };

/** Jede datierte Aufhebung gibt ihren Betrag genau einmal für eine Wiederzuordnung frei. */
export async function reassignmentSources(q: Db | Tx, transactionId: string): Promise<ReassignmentSource[]> {
  return q.execute<ReassignmentSource>(sql`
    select original.id, cancellation.date,
           (original.amount - coalesce(sum(replacement.amount), 0))::integer as remaining
    from allocations original
    join allocations cancellation on cancellation.reverses_id = original.id
    left join allocations replacement on replacement.reassigns_id = original.id
    where original.transaction_id = ${transactionId} and cancellation.date is not null
    group by original.id, cancellation.date
    having original.amount <> coalesce(sum(replacement.amount), 0)
    order by cancellation.date, original.created_at, original.id
  `);
}

/** Der Aufrufer hat den Bankumsatz gesperrt. Das Datum stammt aus der Aufhebung, nie aus der Eingabe. */
export async function reassignmentSource(tx: Tx, transactionId: string, amount: number, reassignsId?: string | null) {
  const history = await reassignmentSources(tx, transactionId);
  const sources = history.filter((source) => Math.sign(source.remaining) === Math.sign(amount));
  if (reassignsId === null && sources.length > 0) {
    const [row] = await tx.execute<{ open: number }>(sql`
      select (b.amount - coalesce(sum(a.amount), 0))::integer as open
      from bank_transactions b left join allocations a on a.transaction_id = b.id
      where b.id = ${transactionId} group by b.id
    `);
    const fresh = row!.open - history.reduce((sum, source) => sum + source.remaining, 0);
    if (Math.sign(fresh) !== Math.sign(amount) || Math.abs(fresh) < Math.abs(amount)) {
      throw new BankError("Für diesen Betrag muss eine aufgehobene Zuordnung gewählt werden.");
    }
    return undefined;
  }
  if (!reassignsId && sources.length > 1) throw new BankError("Bitte die aufgehobene Zuordnung auswählen, auf die sich dieser Betrag bezieht.");
  const selected = reassignsId ? sources.find((source) => source.id === reassignsId) : sources[0];
  if (reassignsId && !selected) throw new BankError("Die gewählte aufgehobene Zuordnung ist für diesen Umsatz nicht verfügbar.");
  if (selected && Math.abs(amount) > Math.abs(selected.remaining)) {
    throw new BankError("Der Betrag übersteigt den offenen Teil der aufgehobenen Zuordnung. Teile den Umsatz auf.");
  }
  return selected;
}
