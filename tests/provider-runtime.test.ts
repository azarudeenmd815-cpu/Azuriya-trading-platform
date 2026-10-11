import { describe, expect, it, vi } from 'vitest';
import {
  ProviderAdapterError,
  ProviderCapabilityRegistry,
  ProviderHealthRuntime,
  builtInProviderDefinitions,
  createBuiltInProviderRegistry,
  providerCapabilities,
  type ProviderAdapterDefinition,
  type ProviderAdapterInstance,
  type ProviderInstanceScope,
} from '../src/server/connectors/provider-runtime/index.js';

const scope = (connectionId: string, organizationId = 'org-a'): ProviderInstanceScope => ({
  organizationId,
  brandId: 'brand-a',
  environmentId: 'env-a',
  productInstanceId: 'instance-a',
  connectionId,
});

function adapterDefinition(options: {
  provider?: string;
  required?: string[];
  health?: () => Promise<{ status: 'healthy' | 'degraded' | 'unavailable'; diagnostic?: string }>;
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
} = {}): ProviderAdapterDefinition {
  const provider = options.provider ?? 'test-provider';
  const instance: ProviderAdapterInstance = {
    operations: {},
    initialize: options.initialize ?? (async () => undefined),
    healthCheck: options.health ?? (async () => ({ status: 'healthy' as const })),
    shutdown: options.shutdown ?? (async () => undefined),
  };
  return {
    descriptor: {
      id: provider,
      family: 'custom',
      name: provider,
      category: 'custom',
      knownFamily: false,
      familyCapabilities: [],
      capabilities: ['connection.health'],
      unavailableCapabilities: providerCapabilities.filter((capability) => capability !== 'connection.health'),
      connectorAvailable: true,
      connectionMode: 'manual',
    },
    implementationVersion: 'test-1.0.0',
    requiredConfiguration: (options.required ?? ['token']).map((key) => ({ key, description: 'Injected test configuration', secret: true })),
    create: () => instance,
  };
}

describe('provider adapter contracts and registry', () => {
  it.each([
    ['metatrader-5', 'MetaTrader 5'],
    ['metatrader-4', 'MetaTrader 4'],
    ['tradelocker', 'TradeLocker'],
    ['ctrader', 'cTrader'],
  ])('discovers the %s provider family without claiming a connection', (id, name) => {
    const registry = createBuiltInProviderRegistry();
    const descriptor = registry.descriptor(id);
    expect(descriptor.name).toBe(name);
    expect(descriptor.knownFamily).toBe(true);
    expect(descriptor.connectorAvailable).toBe(false);
    expect(descriptor.capabilities).toEqual([]);
    expect(descriptor.unavailableCapabilities).toEqual(providerCapabilities);
  });

  it('rejects unknown providers and duplicate registrations deterministically', () => {
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ provider: 'injected' }));
    expect(() => registry.resolve('missing')).toThrowError(expect.objectContaining({ code: 'UNKNOWN_PROVIDER' }));
    expect(() => registry.register(adapterDefinition({ provider: 'injected' }))).toThrowError(expect.objectContaining({ code: 'DUPLICATE_PROVIDER' }));
  });

  it('does not expose mutable capability metadata', () => {
    const registry = createBuiltInProviderRegistry();
    const descriptors = registry.descriptors();
    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(descriptors[0]!.capabilities)).toBe(true);
    expect(() => (descriptors[0]!.unavailableCapabilities as string[]).push('order.submit')).toThrow();
    expect(registry.descriptor('metatrader-5').unavailableCapabilities).toHaveLength(providerCapabilities.length);
  });

  it('returns typed unsupported-operation errors from placeholders and never performs I/O', async () => {
    const definition = builtInProviderDefinitions[0]!;
    const instance = definition.create({ scope: scope('placeholder'), environment: 'sandbox', configuration: {} });
    await expect(instance.operations.submitOrder?.({ providerAccountId: 'a', symbol: 'EURUSD', side: 'buy', volume: '1', idempotencyKey: 'key' })).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    await expect(instance.initialize()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});

describe('provider health runtime', () => {
  it('keeps an unconfigured instance nonhealthy', async () => {
    const registry = createBuiltInProviderRegistry();
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('unconfigured');
    runtime.register(instance, 'metatrader-5', {});
    await expect(runtime.check(instance)).resolves.toMatchObject({ state: 'UNCONFIGURED', errorCode: 'CONFIGURATION_MISSING' });
  });

  it('allows HEALTHY only for a configured injected adapter that validates successfully', async () => {
    const registry = new ProviderCapabilityRegistry();
    const initialize = vi.fn(async () => undefined);
    const health = vi.fn(async () => ({ status: 'healthy' as const }));
    registry.register(adapterDefinition({ initialize, health }));
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('healthy');
    runtime.register(instance, 'test-provider', { token: 'fake-secret' });
    await expect(runtime.check(instance)).resolves.toMatchObject({ state: 'HEALTHY' });
    expect(initialize).toHaveBeenCalledOnce();
    expect(health).toHaveBeenCalledOnce();
  });

  it.each([
    ['AUTHENTICATION_REJECTED', 'UNAVAILABLE'],
    ['TRANSPORT_FAILURE', 'UNAVAILABLE'],
    ['TIMEOUT', 'UNAVAILABLE'],
  ] as const)('maps %s to a safe nonhealthy result', async (code, state) => {
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ initialize: async () => { throw new ProviderAdapterError(code); } }));
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope(`error-${code}`);
    runtime.register(instance, 'test-provider', { token: 'fake-secret' });
    await expect(runtime.check(instance)).resolves.toMatchObject({ state, errorCode: code });
  });

  it('bounds a health check and ignores late completion after timeout', async () => {
    let resolve!: (value: { status: 'healthy' }) => void;
    const health = () => new Promise<{ status: 'healthy' }>((done) => { resolve = done; });
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ health }));
    const runtime = new ProviderHealthRuntime(registry, { timeoutMs: 5 });
    const instance = scope('timeout');
    runtime.register(instance, 'test-provider', { token: 'fake-secret' });
    await expect(runtime.check(instance)).resolves.toMatchObject({ state: 'UNAVAILABLE', errorCode: 'TIMEOUT' });
    resolve({ status: 'healthy' });
    await new Promise((done) => setTimeout(done, 0));
    expect(runtime.observation(instance)).toMatchObject({ state: 'UNAVAILABLE', errorCode: 'TIMEOUT' });
  });

  it('retries initialization after a timeout and ignores the late first initializer', async () => {
    const releases: Array<() => void> = [];
    const initialize = vi.fn(() => new Promise<void>((resolve) => { releases.push(resolve); }));
    const health = vi.fn(async () => ({ status: 'healthy' as const }));
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ initialize, health }));
    const runtime = new ProviderHealthRuntime(registry, { timeoutMs: 5 });
    const instance = scope('retry-init');
    runtime.register(instance, 'test-provider', { token: 'fake-secret' });
    const first = runtime.check(instance);
    await expect(first).resolves.toMatchObject({ state: 'UNAVAILABLE', errorCode: 'TIMEOUT' });
    releases[0]!();
    await new Promise((done) => setTimeout(done, 0));
    const second = runtime.check(instance);
    await new Promise((done) => setTimeout(done, 0));
    expect(initialize).toHaveBeenCalledTimes(2);
    releases[1]!();
    await expect(second).resolves.toMatchObject({ state: 'HEALTHY' });
    expect(health).toHaveBeenCalledOnce();
  });

  it('fails closed when an adapter lacks the connection health capability', async () => {
    const registry = new ProviderCapabilityRegistry();
    registry.register({ ...adapterDefinition({ provider: 'no-health' }), descriptor: { ...adapterDefinition({ provider: 'no-health' }).descriptor, capabilities: [], unavailableCapabilities: providerCapabilities } });
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('no-health');
    runtime.register(instance, 'no-health', { token: 'fake-secret' });
    await expect(runtime.check(instance)).resolves.toMatchObject({ state: 'UNAVAILABLE', errorCode: 'UNSUPPORTED_OPERATION' });
  });

  it('isolates an adapter factory failure as a sanitized unavailable result', async () => {
    const registry = new ProviderCapabilityRegistry();
    const definition = adapterDefinition({ provider: 'factory-failure' });
    registry.register({ ...definition, create: () => { throw new Error('credential=do-not-leak'); } });
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('factory-failure');
    runtime.register(instance, 'factory-failure', { token: 'fake-secret' });
    const observation = await runtime.check(instance);
    expect(observation).toMatchObject({ state: 'UNAVAILABLE', errorCode: 'UNEXPECTED_FAILURE' });
    expect(JSON.stringify(observation)).not.toContain('do-not-leak');
  });

  it('prevents stale concurrent checks from overwriting the newer result', async () => {
    const resolvers: Array<(value: { status: 'healthy' | 'unavailable' }) => void> = [];
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ health: () => new Promise((resolve) => resolvers.push(resolve)) }));
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('concurrent');
    runtime.register(instance, 'test-provider', { token: 'fake-secret' });
    const older = runtime.check(instance);
    const newer = runtime.check(instance);
    await new Promise((done) => setTimeout(done, 0));
    resolvers[1]!({ status: 'healthy' });
    await expect(newer).resolves.toMatchObject({ state: 'HEALTHY' });
    resolvers[0]!({ status: 'unavailable' });
    await expect(older).resolves.toMatchObject({ state: 'HEALTHY' });
    expect(runtime.observation(instance)).toMatchObject({ state: 'HEALTHY' });
  });

  it('initializes an instance once when concurrent checks overlap', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const initialize = vi.fn(async () => gate);
    const healthResolvers: Array<(value: { status: 'healthy' }) => void> = [];
    const health = vi.fn(() => new Promise<{ status: 'healthy' }>((resolve) => healthResolvers.push(resolve)));
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ initialize, health }));
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('single-init');
    runtime.register(instance, 'test-provider', { token: 'fake-secret' });
    const first = runtime.check(instance);
    const second = runtime.check(instance);
    await new Promise((done) => setTimeout(done, 0));
    expect(initialize).toHaveBeenCalledOnce();
    release();
    await new Promise((done) => setTimeout(done, 0));
    healthResolvers[1]!({ status: 'healthy' });
    await expect(second).resolves.toMatchObject({ state: 'HEALTHY' });
    healthResolvers[0]!({ status: 'healthy' });
    await expect(first).resolves.toMatchObject({ state: 'HEALTHY' });
    expect(health).toHaveBeenCalledTimes(2);
  });

  it('does not let shutdown during initialization become healthy after a late completion', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const initialize = vi.fn(async () => gate);
    const health = vi.fn(async () => ({ status: 'healthy' as const }));
    const shutdown = vi.fn(async () => undefined);
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ initialize, health, shutdown }));
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('shutdown-init');
    runtime.register(instance, 'test-provider', { token: 'fake-secret' });
    const check = runtime.check(instance);
    await new Promise((done) => setTimeout(done, 0));
    await runtime.shutdown(instance);
    release();
    await expect(check).resolves.toMatchObject({ state: 'DISCONNECTED', errorCode: 'SHUTDOWN' });
    expect(health).not.toHaveBeenCalled();
    expect(runtime.observation(instance)).toMatchObject({ state: 'DISCONNECTED', errorCode: 'SHUTDOWN' });
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('preserves the shutdown diagnostic when an older check completes after shutdown', async () => {
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ provider: 'shutdown-metadata', health: async () => ({ status: 'healthy' as const }) }));
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('shutdown-metadata');
    runtime.register(instance, 'shutdown-metadata', { token: 'fake-secret' });
    await runtime.shutdown(instance);
    const observation = runtime.observation(instance);
    expect(observation).toMatchObject({ state: 'DISCONNECTED', errorCode: 'SHUTDOWN' });
    expect(observation.diagnostic).toBeUndefined();
  });

  it('isolates provider A, same-family instances, and tenant scopes', async () => {
    const registry = new ProviderCapabilityRegistry();
    const states = new Map<string, 'healthy' | 'unavailable'>();
    registry.register({ ...adapterDefinition({ provider: 'scoped' }), create: ({ scope: current }) => ({ operations: {}, initialize: async () => undefined, healthCheck: async () => ({ status: states.get(`${current.organizationId}:${current.connectionId}`) ?? 'unavailable' }), shutdown: async () => undefined }) });
    const runtime = new ProviderHealthRuntime(registry);
    const a = scope('a'); const b = scope('b'); const otherTenant = scope('a', 'org-b');
    states.set('org-a:a', 'healthy'); states.set('org-a:b', 'unavailable'); states.set('org-b:a', 'unavailable');
    runtime.register(a, 'scoped', { token: 'a' }); runtime.register(b, 'scoped', { token: 'b' }); runtime.register(otherTenant, 'scoped', { token: 'other' });
    await expect(runtime.check(a)).resolves.toMatchObject({ state: 'HEALTHY' });
    await expect(runtime.check(b)).resolves.toMatchObject({ state: 'UNAVAILABLE' });
    await expect(runtime.check(otherTenant)).resolves.toMatchObject({ state: 'UNAVAILABLE' });
  });

  it('keeps delimiter-containing scopes distinct', async () => {
    const registry = new ProviderCapabilityRegistry();
    registry.register({ ...adapterDefinition({ provider: 'delimited' }), create: ({ scope: current }) => ({ operations: {}, initialize: async () => undefined, healthCheck: async () => ({ status: current.organizationId === 'org:a' ? 'healthy' as const : 'unavailable' as const }), shutdown: async () => undefined }) });
    const runtime = new ProviderHealthRuntime(registry);
    const first = scope('connection', 'org:a');
    const second = { ...scope('connection', 'org'), brandId: 'a:brand-a' };
    runtime.register(first, 'delimited', { token: 'first' });
    runtime.register(second, 'delimited', { token: 'second' });
    await expect(runtime.check(first)).resolves.toMatchObject({ state: 'HEALTHY' });
    await expect(runtime.check(second)).resolves.toMatchObject({ state: 'UNAVAILABLE' });
  });

  it('rejects malformed runtime scope values with a typed error', () => {
    const registry = createBuiltInProviderRegistry();
    const runtime = new ProviderHealthRuntime(registry);
    expect(() => runtime.register({ ...scope('malformed'), connectionId: 123 as never }, 'metatrader-5', {})).toThrowError(expect.objectContaining({ code: 'UNKNOWN_INSTANCE' }));
  });

  it('redacts injected secrets, isolates failures, and shuts down idempotently', async () => {
    const shutdown = vi.fn(async () => undefined);
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ provider: 'safe', health: async () => { throw new ProviderAdapterError('TRANSPORT_FAILURE', 'ignored', false, 'token=fake-secret'); }, shutdown }));
    registry.register(adapterDefinition({ provider: 'good' }));
    const runtime = new ProviderHealthRuntime(registry);
    const bad = scope('bad'); const good = scope('good');
    runtime.register(bad, 'safe', { token: 'fake-secret' }); runtime.register(good, 'good', { token: 'fake-secret' });
    const badResult = await runtime.check(bad); expect(badResult.diagnostic).not.toContain('fake-secret');
    await expect(runtime.check(good)).resolves.toMatchObject({ state: 'HEALTHY' });
    await runtime.shutdown(bad); await runtime.shutdown(bad);
    expect(shutdown).toHaveBeenCalledOnce();
    expect(runtime.observation(bad)).toMatchObject({ state: 'DISCONNECTED' });
  });

  it('redacts bearer and quoted secret diagnostics', async () => {
    const registry = new ProviderCapabilityRegistry();
    registry.register(adapterDefinition({ provider: 'diagnostic-safe', health: async () => { throw new ProviderAdapterError('TRANSPORT_FAILURE', 'ignored', false, 'Authorization: Bearer "bearer-secret" token="quoted-secret"'); } }));
    const runtime = new ProviderHealthRuntime(registry);
    const instance = scope('diagnostic-safe');
    runtime.register(instance, 'diagnostic-safe', { token: 'unused' });
    const observation = await runtime.check(instance);
    expect(observation.diagnostic).not.toContain('bearer-secret');
    expect(observation.diagnostic).not.toContain('quoted-secret');
  });
});
