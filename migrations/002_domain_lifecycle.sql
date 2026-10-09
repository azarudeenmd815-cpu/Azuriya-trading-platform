-- Keep old aliases readable while using the full lifecycle for newly-created domains.
ALTER TABLE domains DROP CONSTRAINT domains_status_check;
ALTER TABLE domains ADD CONSTRAINT domains_status_check CHECK (status IN (
  'pending','awaiting_dns','verifying','verified','ssl_provisioning','active','failed','suspended',
  'pending_verification','provisioning','disabled'
));
ALTER TABLE domains ALTER COLUMN status SET DEFAULT 'awaiting_dns';
ALTER TABLE integration_requests ADD COLUMN assigned_team text;
