-- #1819: Erledigt-Vermerke zu Bescheiden sind Ereignisse wie die übrigen im Postfach: nur anhängen, nie ändern, nie löschen,
-- und im Audit-Log mit Akteur. Muster: postfach_requests (0299) und bank_duplicate_decisions.
CREATE TRIGGER postfach_erledigt_append_only BEFORE UPDATE OR DELETE ON postfach_erledigt
  FOR EACH ROW EXECUTE FUNCTION haben_append_only();
--> statement-breakpoint
CREATE TRIGGER postfach_erledigt_audit AFTER INSERT ON postfach_erledigt
  FOR EACH ROW EXECUTE FUNCTION haben_audit();
--> statement-breakpoint
CREATE TRIGGER postfach_erledigt_no_truncate BEFORE TRUNCATE ON postfach_erledigt
  FOR EACH STATEMENT EXECUTE FUNCTION haben_reject_truncate();
