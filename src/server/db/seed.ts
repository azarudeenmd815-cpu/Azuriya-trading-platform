import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import { permissions } from '../../shared/types.js';

const products = [
  { slug: 'brokerage', name: 'Brokerage', description: 'Brokerage business platform foundation.', modules: ['clients', 'accounts', 'operations'] },
  { slug: 'brokerage-crm', name: 'Brokerage CRM', description: 'White-label brokerage client, verification, account and payment operations.', modules: ['clients','onboarding','accounts','verification','finance','ib_partners','reports','communications','integrations','staff'] },
  { slug: 'prop-crm', name: 'Prop Firm CRM', description: 'Client management for proprietary trading firms.', modules: ['clients', 'integrations', 'staff'] },
  { slug: 'api', name: 'Azuriya API', description: 'Scoped application credentials and API management.', modules: ['applications', 'api_keys', 'webhooks'] },
  { slug: 'trading-hub', name: 'Trading Hub', description: 'Shared trading workspace product foundation.', modules: ['workspace'] },
  { slug: 'affiliate-portal', name: 'Affiliate Portal', description: 'Affiliate access product foundation.', modules: ['affiliates'] },
  { slug: 'trading-terminal', name: 'Trading Terminal', description: 'Trading terminal access product foundation.', modules: ['terminal'] },
] as const;

const tradingProducts = ['brokerage', 'brokerage-crm', 'prop-crm', 'api', 'trading-terminal'];
const providers = [
  { slug: 'azuriya-brokerage', name: 'Azuriya Brokerage', category: 'brokerage', managed: true, products: [...tradingProducts, 'trading-hub'] },
  { slug: 'metatrader-5', name: 'MetaTrader 5', category: 'trading_platform', managed: false, products: tradingProducts },
  { slug: 'metatrader-4', name: 'MetaTrader 4', category: 'trading_platform', managed: false, products: tradingProducts },
  { slug: 'tradelocker', name: 'TradeLocker', category: 'trading_platform', managed: false, products: tradingProducts },
  { slug: 'ctrader', name: 'cTrader', category: 'trading_platform', managed: false, products: tradingProducts },
  { slug: 'match-trader', name: 'Match-Trader', category: 'trading_platform', managed: false, products: tradingProducts },
] as const;
// Desired normalized observations are planning metadata, never available adapter operations.
const plannedCapabilities = ['account.read', 'balance.read', 'equity.read', 'margin.read', 'orders.read', 'positions.read', 'trades.read', 'history.read'];

/** Shared catalog only: never manufacture organizations, credentials, or working connectors. */
export async function seedCatalog(db: Database): Promise<void> {
  await db.transaction({ core: true }, async tx => {
    for (const product of products) {
      await tx.query('INSERT INTO products(id,slug,name,description,modules) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (slug) DO NOTHING', [randomUUID(), product.slug, product.name, product.description, JSON.stringify(product.modules)]);
    }
    for (const permission of permissions) {
      await tx.query('INSERT INTO permissions(code,description) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING', [permission, permission.replace('.', ': ')]);
    }
    for (const provider of providers) {
      const result = await tx.query<{ id: string }>(
        "INSERT INTO integration_providers(id,slug,name,category,description,status,connection_mode,supported_products,managed,connector_available) VALUES ($1,$2,$3,$4,$5,'request_only','request',$6::jsonb,$7,false) ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id",
        [randomUUID(), provider.slug, provider.name, provider.category, `${provider.name} integration can be requested. A connector is not implemented in this foundation.`, JSON.stringify(provider.products), provider.managed],
      );
      for (const capability of plannedCapabilities) await tx.query('INSERT INTO integration_provider_capabilities(provider_id,capability) VALUES ($1,$2) ON CONFLICT DO NOTHING', [result.rows[0].id, `planned.${capability}`]);
    }
  });
}
