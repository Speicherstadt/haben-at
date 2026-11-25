import { useState, type FormEvent, type ReactNode } from "react";
import { useAction } from "../../lib/use-action.ts";
import { useSubmitCheck } from "../../lib/use-submit-check.ts";
import { Field } from "../Field.tsx";
import { FilePicker } from "../FilePicker.tsx";
import { NoticeBanner } from "../NoticeBanner.tsx";

type Props<T> = {
  id: string;
  title: string;
  label: string;
  missing: string;
  submitLabel: string;
  read: (input: { data: FormData }) => Promise<T>;
  children: (preview: T) => ReactNode;
};

/** Karte für eine WISO-Liste als PDF: Datei wählen, auf dem Server lesen, Ergebnis über `children` zeigen. */
export function WisoPdfPreview<T>({ id, title, label, missing, submitLabel, read, children }: Props<T>) {
  const action = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<T | null>(null);
  const submit = useSubmitCheck({ file: file ? null : missing });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!submit.check() || !file) return;
    const data = new FormData();
    data.append("file", file);
    void action.run(async () => {
      setPreview(null);
      setPreview(await read({ data }));
    });
  }

  return (
    <section className="card stack" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      <form ref={submit.form} className="stack" noValidate onSubmit={onSubmit}>
        <Field label={label} hint="PDF mit Textebene, höchstens 20 MB und 100 Seiten." error={submit.error("file")}>
          {(control) => (
            <FilePicker
              {...control}
              accept=".pdf,application/pdf"
              disabled={action.busy}
              required
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                action.setNotice(null);
              }}
            />
          )}
        </Field>
        <div className="actions">
          <button type="submit" className="btn" disabled={action.busy}>
            {action.busy ? "Lese PDF …" : submitLabel}
          </button>
        </div>
      </form>
      <NoticeBanner notice={action.notice} />
      {preview !== null && children(preview)}
    </section>
  );
}

export function WisoWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="upload-messages">
      {warnings.map((warning) => (
        <li className="banner banner-warn" key={warning}>
          {warning}
        </li>
      ))}
    </ul>
  );
}
