import type { ProductSlug } from '../../shared/types.js';
import type { CredentialScope, CredentialVault } from './vault.js';
import type { TradingCapability } from './trading-provider.js';

/** Shared provider capabilities describe actual supported adapter operations. */
export type ProviderCapability = TradingCapability | 'account.sync' | 'identity.verify' | 'payment.create' | 'payment.status' | 'notification.send' | 'market_data.read' | 'trade.read' | 'affiliate.sync' | 'webhook.receive' | 'trading_platform' | 'charting' | 'identity_verification' | 'payments' | 'transactional_email';
export interface ProviderDescriptor {
  id: string;
  slug: string;
  name: string;
  category: string;
  supportedProducts: ProductSlug[];
  capabilities: ProviderCapability[];
  connectionMode: 'request' | 'oauth' | 'api_key' | 'managed' | 'manual';
  connectorAvailable: boolean;
  managed: boolean;
}
export interface ProviderConnectionContext {
  scope: CredentialScope;
  credentialReference: string;
  vault: CredentialVault;
  requestId: string;
}
export interface ProviderHealth {
  status: 'connected' | 'failed';
  checkedAt: string;
  /** A provider-safe error code; never tokens or raw provider responses. */
  errorCode?: string;
}
/** External connectors must implement this boundary before a connection is actionable. */
export interface IntegrationAdapter {
  descriptor: ProviderDescriptor;
  validateConnection(context: ProviderConnectionContext): Promise<ProviderHealth>;
  disconnect(context: ProviderConnectionContext): Promise<void>;
}
