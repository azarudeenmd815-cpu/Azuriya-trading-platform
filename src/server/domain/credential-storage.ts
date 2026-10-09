import type { Database } from '../db/database.js';
import { AesCredentialVault, type CredentialStore, type EncryptedCredential } from './vault.js';
export function databaseVault(db: Database, encodedKey = process.env.SECRET_ENCRYPTION_KEY) {
  const store: CredentialStore = {
    put: (id, envelope, scope) => db.transaction({ organizationId: scope.organizationId }, async tx => {
      await tx.query('INSERT INTO credential_envelopes(id,organization_id,provider_id,product_instance_id,envelope) VALUES($1,$2,$3,$4,$5::jsonb)', [id, scope.organizationId, scope.providerId, scope.productInstanceId, JSON.stringify(envelope)]);
    }),
    get: (id, scope) => db.transaction({ organizationId: scope.organizationId }, async tx => (await tx.query<{ envelope: EncryptedCredential }>('SELECT envelope FROM credential_envelopes WHERE id=$1 AND organization_id=$2 AND provider_id=$3 AND product_instance_id=$4', [id, scope.organizationId, scope.providerId, scope.productInstanceId])).rows[0]?.envelope),
  };
  return new AesCredentialVault(store, encodedKey ? Buffer.from(encodedKey, 'base64') : undefined);
}
