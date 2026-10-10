import {
  ProviderAdapterError,
  type ProviderAdapterDefinition,
  type ProviderDescriptor,
  type ProviderIdentifier,
} from './contracts.js';

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
