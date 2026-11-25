import { BuchhaltungsButlerImport } from "./BuchhaltungsButlerImport.tsx";
import { FastbillReceipts } from "./FastbillReceipts.tsx";
import { FastbillArticles, fastbillUsageText } from "./FastbillTeile.tsx";
import { FastbillZeiten } from "./FastbillZeiten.tsx";
import { ImportCard } from "./MigrationImportCard.tsx";
import { Connection } from "./MigrationVerbindung.tsx";
import { SevdeskExportImport } from "./SevdeskExportImport.tsx";
import { WebBackup } from "./WebBackup.tsx";
import { WisoImport } from "./WisoImport.tsx";
import { WisoAssets } from "./WisoAssets.tsx";
import { WisoContacts } from "./WisoContacts.tsx";
import type { MigrationData, Source } from "./migration-quellen.ts";

export function MigrationCards({ source, data }: { source: Source; data: MigrationData }) {
  switch (source) {
    case "lexoffice":
      return <LexofficeCard data={data} />;
    case "sevdesk":
      return <SevdeskCard data={data} />;
    case "fastbill":
      return <FastbillCard data={data} />;
    case "accountable":
      return <AccountableCard initial={data.accountableImport} />;
    case "buchhaltungsbutler":
      return <BuchhaltungsButlerImport initial={data.bbImport} />;
    case "wiso":
      return (
        <>
          <WisoImport initial={data.wisoImport} />
          <WisoAssets />
          <WisoContacts />
        </>
      );
  }
}

function LexofficeCard({ data }: { data: MigrationData }) {
  const { connection, lastImport } = data;
  return (
    <>
      <Connection source="lexoffice" connected={connection ? { name: connection.organizationName || "Lexware Office", since: connection.createdAt } : null} />
      {!connection && <WebBackup />}
      <ImportCard key={lastImport?.id ?? "neu"} source="lexoffice" connected={Boolean(connection)} initial={lastImport} />
    </>
  );
}

function SevdeskCard({ data }: { data: MigrationData }) {
  const { sevdeskConnection, sevdeskImport, sevdeskExportImport } = data;
  return (
    <>
      <Connection source="sevdesk" connected={sevdeskConnection ? { name: "sevDesk", since: sevdeskConnection.createdAt } : null} />
      <ImportCard key={sevdeskImport?.id ?? "neu"} source="sevdesk" connected={Boolean(sevdeskConnection)} initial={sevdeskImport} />
      <SevdeskExportImport key={`sevdesk-export-${sevdeskExportImport?.id ?? "neu"}`} initial={sevdeskExportImport} />
    </>
  );
}

function FastbillCard({ data }: { data: MigrationData }) {
  const { fastbillConnection, fastbillPlans, fastbillUsage, fastbillImport, fastbillReceipts } = data;
  return (
    <>
      <Connection
        source="fastbill"
        plans={fastbillPlans}
        connected={
          fastbillConnection
            ? {
                name: fastbillConnection.email,
                since: fastbillConnection.createdAt,
                detail: `Tarif ${fastbillPlans.find((plan) => plan.callsPerHour === fastbillConnection.callsPerHour)?.label ?? ""}, ${fastbillConnection.callsPerHour} Anfragen pro Stunde.${fastbillUsageText(fastbillUsage, fastbillConnection.callsPerHour)}`,
              }
            : null
        }
      />
      <ImportCard key={fastbillImport?.id ?? "neu"} source="fastbill" connected={Boolean(fastbillConnection)} initial={fastbillImport} />
      <FastbillReceipts receipts={fastbillReceipts} running={fastbillImport?.status === "laeuft"} />
      {fastbillConnection && <FastbillArticles />}
      {fastbillConnection && <FastbillZeiten />}
    </>
  );
}

function AccountableCard({ initial }: { initial: MigrationData["accountableImport"] }) {
  return <ImportCard key={initial?.id ?? "neu"} source="accountable" connected initial={initial} />;
}
