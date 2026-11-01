DROP TRIGGER IF EXISTS audit_log_no_truncate ON "audit_log";--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_append_only ON "audit_log";--> statement-breakpoint
DROP FUNCTION IF EXISTS audit_log_reject_mutation();
