import {
  providerCapabilities,
  providerFamilies,
  ProviderAdapterError,
  unsupportedOperation,
  type ProviderAdapterDefinition,
  type ProviderAdapterInstance,
  type ProviderCapability,
  type ProviderFamily,
} from './contracts.js';
import { ProviderCapabilityRegistry } from './registry.js';

class PlaceholderAdapter implements ProviderAdapterInstance {
  readonly operations = {
    discoverAccounts: async () => unsupportedOperation('account.discovery'),
    getBalance: async () => unsupportedOperation('account.balance'),
    getEquity: async () => unsupportedOperation('account.equity'),
    discoverSymbols: async () => unsupportedOperation('symbol.discovery'),
    subscribeQuotes: async () => unsupportedOperation('quote.subscribe'),
    getHistoricalCandles: async () => unsupportedOperation('candles.history'),
    submitOrder: async () => unsupportedOperation('order.submit'),
    cancelOrder: async () => unsupportedOperation('order.cancel'),
    getOrderStatus: async () => unsupportedOperation('order.status'),
    getOpenPositions: async () => unsupportedOperation('position.open'),
    synchronizePositions: async () => unsupportedOperation('position.sync'),
    getHistoricalFills: async () => unsupportedOperation('fills.history'),
    getAccountTransactions: async () => unsupportedOperation('transactions.history'),
    reconcile: async () => unsupportedOperation('reconciliation'),
  };

  async initialize(): Promise<void> {
    throw new ProviderAdapterError('PROVIDER_UNAVAILABLE', 'No live provider adapter is installed for this family.');
  }

  async healthCheck(): Promise<never> {
    throw new ProviderAdapterError('UNSUPPORTED_OPERATION', 'Provider health validation is not implemented.');
  }

  async shutdown(): Promise<void> { /* No external resource was opened. */ }
}

function placeholder(family: ProviderFamily, name: string): ProviderAdapterDefinition {
  const unavailable = [...providerCapabilities] as ProviderCapability[];
  return Object.freeze({
    descriptor: Object.freeze({
      id: family,
      family,
      name,
      category: 'trading_platform' as const,
      knownFamily: true,
      familyCapabilities: Object.freeze(unavailable),
      capabilities: Object.freeze([] as ProviderCapability[]),
      unavailableCapabilities: Object.freeze(unavailable),
      connectorAvailable: false,
      connectionMode: 'none' as const,
    }),
    implementationVersion: '0.1.0-placeholder',
    requiredConfiguration: Object.freeze([]),
    isConfigured: () => false,
    create: () => new PlaceholderAdapter(),
  });
}

export const builtInProviderDefinitions: readonly ProviderAdapterDefinition[] = Object.freeze([
  placeholder('metatrader-5', 'MetaTrader 5'),
  placeholder('metatrader-4', 'MetaTrader 4'),
  placeholder('tradelocker', 'TradeLocker'),
  placeholder('ctrader', 'cTrader'),
]);

export function createBuiltInProviderRegistry(): ProviderCapabilityRegistry {
  const registry = new ProviderCapabilityRegistry();
  for (const definition of builtInProviderDefinitions) registry.register(definition);
  return registry;
}

export function isBuiltInProvider(provider: string): provider is ProviderFamily {
  return (providerFamilies as readonly string[]).includes(provider);
}
