/**
 * A unit's state, as stored by schema v2. **Frozen**, for the same reason `WireUnitV1` is: nothing
 * in `src/` reads it, and it is the only description of the bytes `MIGRATIONS[2]` operates on.
 * Deleting it because the compiler sees no reference deletes the map to the territory.
 *
 * The only change from v1 was `lastProven` on the learning variant — the day a unit was last
 * successfully retrieved, which the scheduler needed and `lastSeen` could not supply because passive
 * exposure refreshes it.
 *
 * @module
 */
export type WireUnitV2 =
  | {
      readonly box: 'learning';
      readonly seen: number;
      readonly lastSeen: number;
      readonly streak: number;
      readonly lastProven: number;
    }
  | {
      readonly box: 'understood';
      readonly seen: number;
      readonly lastSeen: number;
      readonly confirmedOn: number;
    };
