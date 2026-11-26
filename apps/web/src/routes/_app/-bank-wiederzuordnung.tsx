import { formatEuro } from "@haben/core";
import { Field } from "../../components/Field.tsx";
import { formatDate } from "../../lib/format.ts";
import { type Detail, zuordnungText } from "./-bank-daten.ts";

type Sources = Detail["reassignment"];

function eligible(sources: Sources, amount: number | null) {
  return sources.filter((source) => amount === null || Math.sign(source.remaining) === Math.sign(amount));
}

export function reassignmentError(sources: Sources, amount: number | null, value: string | undefined) {
  if (amount === null || amount === 0) return null;
  const candidates = eligible(sources, amount);
  if (value === "neu") return null;
  const selected = value ? candidates.find((candidate) => candidate.id === value) : candidates.length === 1 ? candidates[0] : undefined;
  if (candidates.length > 0 && !selected) return "Wähle die aufgehobene Zuordnung, zu der der Betrag gehört.";
  if (selected && Math.abs(amount) > Math.abs(selected.remaining)) return "Der Betrag ist größer als der verfügbare Teil dieser Zuordnung.";
  return null;
}

export function reassignmentId(value: string | undefined, sources: Sources, amount: number) {
  if (!value || eligible(sources, amount).length === 0) return undefined;
  return value === "neu" ? null : value;
}

export function ReassignmentField({
  detail,
  label = "Aufgehobene Zuordnung",
  amount,
  value,
  error,
  gesellschaft,
  onChange,
}: {
  detail: Pick<Detail, "transaction" | "reassignment" | "allocations">;
  label?: string;
  amount: number | null;
  value: string | undefined;
  error: string | undefined;
  gesellschaft: boolean;
  onChange: (value: string) => void;
}) {
  const candidates = eligible(detail.reassignment, amount);
  if (candidates.length === 0) return null;
  const fresh = detail.transaction.open - detail.reassignment.reduce((sum, source) => sum + source.remaining, 0);
  const allowFresh = fresh !== 0 && (amount === null || Math.sign(fresh) === Math.sign(amount));
  return (
    <Field label={label} error={error}>
      {(control) => (
        <select {...control} value={value || (candidates.length === 1 ? candidates[0]?.id : "")} onChange={(event) => onChange(event.target.value)}>
          <option value="">Bitte wählen</option>
          {candidates.map((source) => {
            const previous = detail.allocations.find((allocation) => allocation.id === source.id);
            return (
              <option key={source.id} value={source.id}>
                {previous ? zuordnungText(previous, gesellschaft) : "Zuordnung"} · {formatDate(source.date)} · {formatEuro(source.remaining)}
              </option>
            );
          })}
          {allowFresh && <option value="neu">Noch nie zugeordnet · {formatEuro(fresh)}</option>}
        </select>
      )}
    </Field>
  );
}
