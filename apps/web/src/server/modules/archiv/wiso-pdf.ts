import { WisoParseError } from "@haben/import";
import { UserError } from "../../errors.ts";
import { sniff } from "../../storage.ts";
import { pdfPageTexts } from "../belege/index.ts";

const MAX_PAGES = 100;

/** Liest eine WISO-Liste als PDF mit Textebene und übergibt die Seitentexte dem Parser aus `@haben/import`. */
export async function readWisoPdf<T>(bytes: Uint8Array, notPdfMessage: string, parse: (pages: string[]) => T): Promise<T> {
  if (sniff(bytes)?.mimeType !== "application/pdf") throw new UserError(notPdfMessage);
  const extracted = await pdfPageTexts(bytes, MAX_PAGES);
  if (!extracted || extracted.pages.every((page) => !page.trim())) {
    throw new UserError("Das PDF ließ sich nicht als Text lesen. Wähle ein ungeschütztes WISO-PDF mit Textebene.");
  }
  if (extracted.truncated) throw new UserError(`Das PDF darf höchstens ${MAX_PAGES} Seiten haben.`);
  try {
    return parse(extracted.pages);
  } catch (error) {
    if (error instanceof WisoParseError) throw new UserError(error.message);
    throw error;
  }
}

export function csvDraft(filename: string, bytes: Uint8Array) {
  return { filename, base64: Buffer.from(bytes).toString("base64") };
}
