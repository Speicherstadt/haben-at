import { Link } from "@tanstack/react-router";
import { Icon } from "./Icon.tsx";

export function InvoiceReplacementNotice({ reference, replacedBy = false }: { reference: { id: string; number: string | null }; replacedBy?: boolean }) {
  return (
    <div className="banner banner-info" role="status">
      <Icon name="info" />
      <span>
        {replacedBy ? "Ersetzt durch" : "Ersetzt"}{" "}
        <Link to="/rechnungen/$id" params={{ id: reference.id }}>
          Rechnung {reference.number}
        </Link>
        .
      </span>
    </div>
  );
}
