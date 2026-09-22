import type { AdapterId } from '../config/schema.js'
import { OrdoError } from '../errors/ordo-error.js'
import type { OrdoAdapter } from './types.js'

export class AdapterRegistry {
  readonly #adapters = new Map<AdapterId, OrdoAdapter>()

  constructor(adapters: readonly OrdoAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter)
    }
  }

  register(adapter: OrdoAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new OrdoError('ADAPTER_DUPLICATE', `Adapter is already registered: ${adapter.id}`)
    }

    this.#adapters.set(adapter.id, adapter)
  }

  has(id: AdapterId): boolean {
    return this.#adapters.has(id)
  }

  get(id: AdapterId): OrdoAdapter {
    const adapter = this.#adapters.get(id)
    if (!adapter) {
      throw new OrdoError('ADAPTER_NOT_FOUND', `Adapter is not registered: ${id}`)
    }

    return adapter
  }

  list(): readonly OrdoAdapter[] {
    return Object.freeze([...this.#adapters.values()].sort((a, b) => a.id.localeCompare(b.id)))
  }
}
