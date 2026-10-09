import type { TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import type { ProviderConnectionContext } from '../domain/integrations.js';
import type { ConnectorEnvironment, ConnectorRuntime } from './runtime.js';

export interface ConnectorConnection {
 id:string;organization_id:string;brand_id:string;environment_id:string;product_instance_id:string;
 provider_id:string;provider_slug:string;provider_environment:ConnectorEnvironment;label:string;status:string;
 credential_reference:string|null;candidate_credential_reference:string|null;credential_revision:number;
 provider_account_reference:string|null;connector_version:string|null;capabilities:string[];created_by:string;
}
export interface ExternalOperation {
 id:string;organization_id:string;brand_id:string;environment_id:string;product_instance_id:string;
 connection_id:string;operation_type:string;resource_type:'connection'|'account'|'payment';resource_id:string;
 account_id:string|null;payment_request_id:string|null;provider_idempotency_key:string;
 provider_reference:string|null;provider_secondary_reference:string|null;credential_revision:number;
 secret_reference:string|null;state:string;attempt:number;max_attempts:number;lease_token:string;
 started_at:string|null;created_at:string;created_by:string;safe_evidence:Record<string,unknown>;
}
export interface OperationExecution {
 db:Database;scope:TenantContext;connection:ConnectorConnection;operation:ExternalOperation;
 runtime:ConnectorRuntime;origin:string;credentials:Record<string,string>;providerContext:ProviderConnectionContext;
}
/** External I/O finishes before apply is invoked inside the result transaction. */
export interface OperationResult {
 provider_reference?:string;secondary_reference?:string;evidence:Record<string,unknown>;
 apply(tx:Executor):Promise<void>;
}
