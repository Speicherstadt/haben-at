import { Link } from "@tanstack/react-router";
import { useAction } from "../lib/use-action.ts";
import { daysUntil } from "../lib/format.ts";
import type { SettingsArea } from "../lib/settings-areas.ts";
import { useBescheidAbhaken } from "../routes/_app/-uebersicht-abhaken.ts";

export interface Todo {
  /** Nur bei Einträgen aus Listen nötig; sonst ist der Titel eindeutig */
  id?: string;
  title: string;
  detail: string;
  action: string;
  tone: "info" | "warn" | "neutral";
  to:
    | "/umsatzsteuer/$zeitraum"
    | "/einstellungen"
    | "/einrichtung"
    | "/rechnungen"
    | "/bank"
    | "/anlagen"
    | "/rechnungen/mahnwesen"
    | "/finanzamt"
    | "/kontakte/$id";
  /** Bereich der Einstellungen, wenn to „/einstellungen“ ist */
  bereich?: SettingsArea;
  /** Der Kontakt, wenn to „/kontakte/$id“ ist */
  kontakt?: string;
  /** Datum (JJJJ-MM-TT), bis zu dem es zu erledigen ist: Eine Frist in den nächsten zwei Wochen oder schon vorbei geht vor, die frühere zuerst */
  frist?: string;
  /** Bescheid aus dem Postfach, der sich hier direkt als geprüft abhaken lässt (#1819); die ID ist die des Dokuments */
  erledigen?: { id: string };
}

const DOT = { info: "var(--info-ink)", warn: "var(--warn-dot)", neutral: "var(--muted)" };

const RANG = { warn: 0, info: 1, neutral: 2 };
/** So viele Einträge stehen offen, der Rest unter „Weitere“ */
export const ZUERST = 3;

/** Eine Frist gilt als nah, wenn sie in so vielen Tagen endet oder schon vorbei ist */
export const FRIST_NAH_TAGE = 14;
const nah = (todo: Todo) => !!todo.frist && daysUntil(todo.frist) <= FRIST_NAH_TAGE;

/** Wie dringend: erst nahe Fristen, die früheste zuerst, dann Warnungen vor Hinweisen vor Anstehendem; sonst bleibt die Reihenfolge der Seite */
export const ordneAufgaben = (todos: Todo[]) =>
  [...todos].sort((a, b) => Number(!nah(a)) - Number(!nah(b)) || (nah(a) ? a.frist!.localeCompare(b.frist!) : 0) || RANG[a.tone] - RANG[b.tone]);

function Eintrag({ todo, zeitraum, onErledigen }: { todo: Todo; zeitraum: string; onErledigen: (id: string) => Promise<void> }) {
  const { busy, notice, run } = useAction();
  const inhalt = (
    <>
      <span className="todo-dot" style={{ background: DOT[todo.tone] }} />
      <span className="todo-body">
        <span className="todo-title">{todo.title}</span>
        <span className="small muted">{todo.detail}</span>
      </span>
      <span className="todo-action">{todo.action}</span>
    </>
  );
  const link =
    todo.to === "/kontakte/$id" ? (
      <Link to="/kontakte/$id" params={{ id: todo.kontakt ?? "" }} className="todo">
        {inhalt}
      </Link>
    ) : (
      <Link to={todo.to} params={{ zeitraum }} search={todo.bereich ? { bereich: todo.bereich } : {}} className="todo">
        {inhalt}
      </Link>
    );
  const erledigen = todo.erledigen?.id ?? null;
  if (erledigen === null) return link;
  // Der Knopf steht neben dem Link, nicht darin: Ein Knopf im Link wäre kein gültiges Markup und würde beim Klick mitnavigieren.
  async function abhaken() {
    if (erledigen === null) return;
    await run(() => onErledigen(erledigen));
  }
  return (
    <div className="todo-zeile">
      {link}
      {notice ? (
        <span className="small" role="alert">
          {notice.text}
        </span>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => void abhaken()}
          title="Bescheid als geprüft abhaken"
          aria-label={`${todo.title} als geprüft abhaken`}
        >
          {busy ? "…" : "Geprüft"}
        </button>
      )}
    </div>
  );
}

/** „Zu erledigen“ (#1253): die drei dringendsten Einträge (`ordneAufgaben`), der Rest zugeklappt unter „Weitere (n)“; nichts entfällt */
export function UebersichtAufgaben({ geordnet, zeitraum }: { geordnet: Todo[]; zeitraum: string }) {
  // Der Hook holt die Server Function; in den Tests ist sie gemockt, damit die Komponente ohne Datenbank läuft
  const onErledigen = useBescheidAbhaken();
  const weitere = geordnet.slice(ZUERST);
  return (
    <section className="card" aria-labelledby="todo-heading">
      <h2 id="todo-heading">Zu erledigen</h2>
      {geordnet.length === 0 && <p className="muted">Alles erledigt.</p>}
      {geordnet.slice(0, ZUERST).map((todo) => (
        <Eintrag key={todo.id ?? todo.title} todo={todo} zeitraum={zeitraum} onErledigen={onErledigen} />
      ))}
      {weitere.length > 0 && (
        <details className="todo-weitere">
          <summary>Weitere ({weitere.length})</summary>
          {weitere.map((todo) => (
            <Eintrag key={todo.id ?? todo.title} todo={todo} zeitraum={zeitraum} onErledigen={onErledigen} />
          ))}
        </details>
      )}
    </section>
  );
}
