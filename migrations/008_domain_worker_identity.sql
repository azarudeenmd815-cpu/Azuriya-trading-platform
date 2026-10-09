-- Additive worker provenance; earlier migration checksums remain unchanged.
ALTER TABLE domains ADD COLUMN created_by uuid REFERENCES users(id);
UPDATE domains d SET created_by=(SELECT a.actor_id FROM audit_events a WHERE a.action='domain.created' AND a.resource_id=d.id::text ORDER BY a.created_at LIMIT 1);
CREATE INDEX outbox_domain_jobs ON outbox_events((payload->>'domain_id'),state) WHERE event_type IN('domain.delivery_check','domain.delivery_cleanup');
