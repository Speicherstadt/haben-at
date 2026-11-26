import { readWisoAssetRegister, type WisoRegisterAsset } from "@haben/import";
import { csv, money } from "./csv.ts";
import { csvDraft, readWisoPdf } from "./wiso-pdf.ts";

function draftCsv(assets: WisoRegisterAsset[]): Uint8Array {
  return csv(
    ["Bezeichnung", "Anschaffungsdatum", "Anschaffungskosten", "Nutzungsdauer (Jahre)", "Restbuchwert", "Art", "Abschreibung", "Degressiver Satz", "Notiz"],
    assets.map((asset) => [
      `${asset.name} [WISO ${asset.inventoryNumber}]`,
      asset.acquisitionDate,
      money(asset.cost),
      asset.usefulLifeYears,
      money(asset.closingBookValue),
      "Bitte ergänzen",
      "Bitte ergänzen",
      "",
      `WISO-Nr. ${asset.inventoryNumber}, Konto ${asset.account}, Seite ${asset.page}` +
        (asset.change || asset.disposalDate ? ". Zugang oder Abgang anhand der Anlagendetails prüfen." : ""),
    ]),
  );
}

export async function previewWisoAssets(bytes: Uint8Array) {
  const preview = await readWisoPdf(bytes, "Bitte ein WISO-Anlagenverzeichnis als PDF auswählen.", readWisoAssetRegister);
  return { ...preview, draft: csvDraft(`WISO-Anlagen-${preview.year}-Entwurf.csv`, draftCsv(preview.assets)) };
}
