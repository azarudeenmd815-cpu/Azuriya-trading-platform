-- Append-only guards apply to statements as well as individual rows.
CREATE TRIGGER immutable_audit_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_ledger_truncate BEFORE TRUNCATE ON account_transactions FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_fills_truncate BEFORE TRUNCATE ON fills FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
