import { asc, desc, eq, inArray } from "drizzle-orm";
import { withActor } from "../../db/actor.ts";
import { db, schema } from "../../db/index.ts";
import { UserError } from "../../errors.ts";

/** Ereignisarten der Tabelle; „wieder offen“ ist ein zweites Ereignis, kein Löschen */
export type ErledigtArt = "geprueft" | "wieder_offen";

export interface ErledigtStand {
  art: ErledigtArt;
  at: Date;
}

/**
 * Jüngstes Ereignis je Dokument (#1819). Die Zeilen kommen aufsteigend, damit die letzte je Dokument gewinnt. Der
 * Zeitstempel ist der Beginn der Transaktion; zwei Vermerke im selben Takt gibt es praktisch nicht, weil jeder Vermerk
 * eine eigene Transaktion ist.
 */
export async function erledigtStand(dokumentIds?: string[]): Promise<Map<string, ErledigtStand>> {
  const zeilen = await db
    .select({
      documentId: schema.postfachErledigt.documentId,
      art: schema.postfachErledigt.art,
      at: schema.postfachErledigt.at,
    })
    .from(schema.postfachErledigt)
    .where(dokumentIds && dokumentIds.length > 0 ? inArray(schema.postfachErledigt.documentId, dokumentIds) : undefined)
    .orderBy(asc(schema.postfachErledigt.at));
  const stand = new Map<string, ErledigtStand>();
  for (const zeile of zeilen) stand.set(zeile.documentId, { art: zeile.art, at: zeile.at });
  return stand;
}

/**
 * Vermerkt einen Bescheid als geprüft oder wieder offen. Der Aufruf ist idempotent: Steht der Zustand schon so, entsteht
 * kein zweites Ereignis, und die Spur bleibt lesbar. Geschrieben wird nur über withActor, damit der Akteur im Audit-Log steht.
 */
export async function erledigtVermerken(documentId: string, art: ErledigtArt, actor: string) {
  return withActor(actor, async (tx) => {
    const [dokument] = await tx.select({ id: schema.postfachDocuments.id }).from(schema.postfachDocuments).where(eq(schema.postfachDocuments.id, documentId));
    if (!dokument) throw new UserError("Diesen Bescheid gibt es nicht.");
    const [letztes] = await tx
      .select({ art: schema.postfachErledigt.art })
      .from(schema.postfachErledigt)
      .where(eq(schema.postfachErledigt.documentId, documentId))
      .orderBy(desc(schema.postfachErledigt.at))
      .limit(1);
    if (letztes?.art === art) return { ok: true, unveraendert: true };
    await tx.insert(schema.postfachErledigt).values({ documentId, art });
    return { ok: true, unveraendert: false };
  });
}
