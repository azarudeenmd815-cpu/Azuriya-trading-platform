import {
  classifyProviderError,
  ProviderAdapterError,
  sanitizeDiagnostic,
  scopeKey,
  type ProviderAdapterInstance,
  type ProviderHealthState,
  type ProviderIdentifier,
  type ProviderInstanceContext,
  type ProviderInstanceScope,
} from './contracts.js';
import { ProviderCapabilityRegistry } from './registry.js';

export interface ProviderHealthObservation {
  readonly provider: ProviderIdentifier;
  readonly state: ProviderHealthState;
  readonly checkedAt: string;
  readonly errorCode?: string;
  readonly diagnostic?: string;
}

export interface ProviderHealthRuntimeOptions {
  readonly timeoutMs?: number;
  readonly clock?: () => number;
}

interface Entry {
  readonly key: string;
  readonly provider: ProviderIdentifier;
  readonly adapter: ProviderAdapterInstance;
  readonly context: ProviderInstanceContext;
  readonly timeoutMs: number;
  generation: number;
  shutdown: boolean;
  initialized: boolean;
  initialization?: { token: symbol; promise: Promise<void> };
  observation: ProviderHealthObservation;
  shutdownPromise?: Promise<void>;
}

interface InitializationHandle {
  readonly token?: symbol;
  readonly promise: Promise<void>;
}

function iso(clock: () => number): string { return new Date(clock()).toISOString(); }

/** Deterministic, tenant-scoped state machine. It does not poll or make network calls by itself. */
export class ProviderHealthRuntime {
  private readonly entries = new Map<string, Entry>();
  private readonly timeoutMs: number;
  private readonly clock: () => number;

  constructor(private readonly registry: ProviderCapabilityRegistry, options: ProviderHealthRuntimeOptions = {}) {
    this.timeoutMs = Math.max(1, Math.min(120_000, Math.floor(options.timeoutMs ?? 10_000)));
    this.clock = options.clock ?? Date.now;
  }

  register(scope: ProviderInstanceScope, provider: ProviderIdentifier, configuration: Readonly<Record<string, string>>, environment: ProviderInstanceContext['environment'] = 'sandbox'): void {
    const key = scopeKey(scope);
    if (this.entries.has(key)) throw new ProviderAdapterError('INSTANCE_ALREADY_REGISTERED', 'The provider connection instance is already registered.');
    const definition = this.registry.resolve(provider);
    const frozenConfiguration = Object.freeze({ ...configuration });
    const context: ProviderInstanceContext = Object.freeze({ scope: Object.freeze({ ...scope }), environment, configuration: frozenConfiguration });
    const observation: ProviderHealthObservation = Object.freeze({ provider, state: 'UNCONFIGURED', checkedAt: iso(this.clock) });
    let adapter: ProviderAdapterInstance;
    try {
      adapter = definition.create(context);
    } catch (error) {
      const safe = classifyProviderError(error);
      adapter = {
        operations: {},
        initialize: async () => { throw safe; },
        healthCheck: async () => { throw safe; },
        shutdown: async () => undefined,
      };
    }
    this.entries.set(key, { key, provider, adapter, context, timeoutMs: this.timeoutMs, generation: 0, shutdown: false, initialized: false, observation });
  }

  observation(scope: ProviderInstanceScope): ProviderHealthObservation {
    const entry = this.entry(scope);
    return Object.freeze({ ...entry.observation });
  }

  async check(scope: ProviderInstanceScope): Promise<ProviderHealthObservation> {
    const entry = this.entry(scope);
    if (entry.shutdown) return this.observation(scope);
    const generation = ++entry.generation;
    entry.observation = Object.freeze({ provider: entry.provider, state: 'CONNECTING', checkedAt: iso(this.clock) });
    const definition = this.registry.resolve(entry.provider);
    let initializationToken: symbol | undefined;
    let active = true;
    try {
      const configured = definition.isConfigured
        ? definition.isConfigured(entry.context.configuration)
        : definition.requiredConfiguration.every((field) => typeof entry.context.configuration[field.key] === 'string' && entry.context.configuration[field.key]!.length > 0);
      if (!configured) {
        const result: ProviderHealthObservation = Object.freeze({ provider: entry.provider, state: 'UNCONFIGURED', checkedAt: iso(this.clock), errorCode: 'CONFIGURATION_MISSING' });
        if (generation === entry.generation) entry.observation = result;
        return generation === entry.generation ? result : this.observation(scope);
      }
      if (!definition.descriptor.capabilities.includes('connection.health')) {
        const result: ProviderHealthObservation = Object.freeze({ provider: entry.provider, state: 'UNAVAILABLE', checkedAt: iso(this.clock), errorCode: 'UNSUPPORTED_OPERATION' });
        if (generation === entry.generation) entry.observation = result;
        return generation === entry.generation ? result : this.observation(scope);
      }
      const signal = await this.withTimeout((async () => {
        const initialization = this.initialize(entry);
        initializationToken = initialization.token;
        await initialization.promise;
        if (entry.shutdown) throw new ProviderAdapterError('SHUTDOWN', 'The provider connection was shut down.');
        if (!active) throw new ProviderAdapterError('TIMEOUT', 'Provider health validation timed out.', true);
        return entry.adapter.healthCheck();
      })(), entry.timeoutMs, () => { active = false; });
      const result: ProviderHealthObservation = Object.freeze({ provider: entry.provider, state: signal.status === 'healthy' ? 'HEALTHY' : signal.status === 'degraded' ? 'DEGRADED' : 'UNAVAILABLE', checkedAt: iso(this.clock), diagnostic: sanitizeDiagnostic(signal.diagnostic, entry.context.configuration), ...(signal.status === 'healthy' ? {} : { errorCode: signal.status === 'degraded' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE' }) });
      if (generation === entry.generation && !entry.shutdown) entry.observation = result;
      return generation === entry.generation ? result : this.observation(scope);
    } catch (error) {
      const safe = classifyProviderError(error);
      // Only the current generation may invalidate its initialization promise.
      // An older overlapping check can time out while a newer check is still
      // waiting on the same initialization; clearing it there would make the
      // newer check fail when the shared initializer eventually completes.
      if (safe.code === 'TIMEOUT' && generation === entry.generation && initializationToken && entry.initialization?.token === initializationToken) {
        entry.initialization = undefined;
      }
      const result: ProviderHealthObservation = Object.freeze({ provider: entry.provider, state: safe.code === 'SHUTDOWN' ? 'DISCONNECTED' : safe.code === 'CONFIGURATION_MISSING' ? 'UNCONFIGURED' : safe.code === 'RATE_LIMITED' ? 'DEGRADED' : 'UNAVAILABLE', checkedAt: iso(this.clock), errorCode: safe.code, diagnostic: sanitizeDiagnostic(safe.diagnostic, entry.context.configuration) });
      if (generation === entry.generation && !entry.shutdown) entry.observation = result;
      return generation === entry.generation ? result : this.observation(scope);
    } finally {
      // Logical expiry also prevents a late shared initializer from starting
      // another provider probe on behalf of a check that already returned.
      active = false;
    }
  }

  async shutdown(scope: ProviderInstanceScope): Promise<void> {
    const entry = this.entry(scope);
    if (entry.shutdownPromise) return entry.shutdownPromise;
    entry.shutdown = true;
    ++entry.generation;
    entry.observation = Object.freeze({ provider: entry.provider, state: 'DISCONNECTED', checkedAt: iso(this.clock), errorCode: 'SHUTDOWN' });
    // Adapter shutdown is provider-controlled and may not support cancellation.
    // Bound it so a hung provider cannot block application shutdown forever;
    // the terminal observation is already recorded before this promise runs.
    entry.shutdownPromise = Promise.resolve()
      .then(() => this.withTimeout(entry.adapter.shutdown(), entry.timeoutMs))
      .catch(() => undefined);
    return entry.shutdownPromise;
  }

  async shutdownAll(): Promise<void> { await Promise.all([...this.entries.values()].map((entry) => this.shutdown(entry.context.scope))); }

  private entry(scope: ProviderInstanceScope): Entry {
    const entry = this.entries.get(scopeKey(scope));
    if (!entry) throw new ProviderAdapterError('UNKNOWN_INSTANCE', 'The provider connection instance is not registered.');
    return entry;
  }

  private initialize(entry: Entry): InitializationHandle {
    if (entry.initialized) return { promise: Promise.resolve() };
    if (!entry.initialization) {
      const token = Symbol('provider-initialization');
      const promise = Promise.resolve().then(() => entry.adapter.initialize()).then(() => {
        if (entry.shutdown || entry.initialization?.token !== token) throw new ProviderAdapterError('SHUTDOWN', 'The provider connection was shut down.');
        entry.initialized = true;
      }).finally(() => { if (entry.initialization?.token === token) entry.initialization = undefined; });
      entry.initialization = { token, promise };
    }
    return entry.initialization;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new ProviderAdapterError('TIMEOUT', 'Provider health validation timed out.', true));
      }, timeoutMs);
    });
    // Attach a rejection handler to the underlying operation. Providers may not support cancellation;
    // generation checks above ensure a late completion cannot mutate the newer state.
    promise.catch(() => undefined);
    try { return await Promise.race([promise, timeout]); } finally { if (timer) clearTimeout(timer); }
  }
}
