CREATE TABLE "postfach_erledigt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"art" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "postfach_erledigt_art" CHECK ("postfach_erledigt"."art" in ('geprueft', 'wieder_offen'))
);
--> statement-breakpoint
ALTER TABLE "postfach_erledigt" ADD CONSTRAINT "postfach_erledigt_document_id_postfach_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."postfach_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "postfach_erledigt_document" ON "postfach_erledigt" USING btree ("document_id","at");