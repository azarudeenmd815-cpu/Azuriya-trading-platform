import {
  ProviderAdapterError,
  providerCapabilities,
  type ProviderAdapterDefinition,
  type ProviderDescriptor,
  type ProviderIdentifier,
} from './contracts.js';

function validateDescriptor(definition: ProviderAdapterDefinition): void {
  const descriptor = definition.descriptor;
  const known = new Set<string>(providerCapabilities);
  const supported = [...descriptor.capabilities];
  const unavailable = [...descriptor.unavailableCapabilities];
  const family = [...descriptor.familyCapabilities];
  const hasDuplicate = (values: readonly string[]) => new Set(values).size !== values.length;
  if (hasDuplicate(supported) || hasDuplicate(unavailable) || hasDuplicate(family)) {
    throw new ProviderAdapterError('INVALID_DESCRIPTOR', `Provider ${descriptor.id} declares duplicate capabilities.`);
  }
  if ([...supported, ...unavailable, ...family].some((capability) => !known.has(capability))) {
    throw new ProviderAdapterError('INVALID_DESCRIPTOR', `Provider ${descriptor.id} declares an unknown capability.`);
  }
  if (supported.some((capability) => unavailable.includes(capability))) {
    throw new ProviderAdapterError('INVALID_DESCRIPTOR', `Provider ${descriptor.id} declares a capability as both supported and unavailable.`);
  }
  const requiredKeys = definition.requiredConfiguration.map((field) => field.key);
  if (requiredKeys.some((key) => typeof key !== 'string' || key.length === 0) || new Set(requiredKeys).size !== requiredKeys.length) {
    throw new ProviderAdapterError('INVALID_DESCRIPTOR', `Provider ${descriptor.id} declares invalid required configuration metadata.`);
  }
}

function freezeDescriptor(descriptor: ProviderDescriptor): ProviderDescriptor {
  return Object.freeze({
    ...descriptor,
    familyCapabilities: Object.freeze([...descriptor.familyCapabilities]),
    capabilities: Object.freeze([...descriptor.capabilities]),
    unavailableCapabilities: Object.freeze([...descriptor.unavailableCapabilities]),
  });
}

/** Internal DI registry. It has no startup I/O and owns no tenant state. */
export class ProviderCapabilityRegistry {
  private readonly definitions = new Map<ProviderIdentifier, ProviderAdapterDefinition>();

  register(definition: ProviderAdapterDefinition): void {
    const id = definition.descriptor.id;
    if (this.definitions.has(id)) throw new ProviderAdapterError('DUPLICATE_PROVIDER', `Provider ${id} is already registered.`);
    validateDescriptor(definition);
    const immutable: ProviderAdapterDefinition = Object.freeze({
      ...definition,
      descriptor: freezeDescriptor(definition.descriptor),
      requiredConfiguration: Object.freeze(definition.requiredConfiguration.map((field) => Object.freeze({ ...field }))),
    });
    this.definitions.set(id, immutable);
  }

  has(provider: ProviderIdentifier): boolean { return this.definitions.has(provider); }

  resolve(provider: ProviderIdentifier): ProviderAdapterDefinition {
    const definition = this.definitions.get(provider);
    if (!definition) throw new ProviderAdapterError('UNKNOWN_PROVIDER', `Provider ${provider} is not registered.`);
    return definition;
  }

  descriptor(provider: ProviderIdentifier): ProviderDescriptor {
    return this.resolve(provider).descriptor;
  }

  descriptors(): readonly ProviderDescriptor[] {
    return Object.freeze([...this.definitions.values()].map((definition) => freezeDescriptor({
      ...definition.descriptor,
      familyCapabilities: [...definition.descriptor.familyCapabilities],
      capabilities: [...definition.descriptor.capabilities],
      unavailableCapabilities: [...definition.descriptor.unavailableCapabilities],
    })));
  }
}
