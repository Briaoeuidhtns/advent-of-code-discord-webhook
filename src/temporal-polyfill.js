import { Temporal, toTemporalInstant } from '@js-temporal/polyfill'

if (!Date.prototype.toTemporalInstant)
  Date.prototype.toTemporalInstant = toTemporalInstant

if (!globalThis.Temporal) globalThis.Temporal = Temporal
