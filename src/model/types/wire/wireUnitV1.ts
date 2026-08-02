/**
 * A unit's state, as stored by schema v1. **Frozen.**
 *
 * Nothing in `src/` reads this type, and that is correct rather than dead code: a migration is
 * `unknown -> unknown` on purpose (see `MIGRATIONS` in `core/persist/`), because it operates on data
 * written by code that no longer exists and typing it against today's shapes would be a lie. These
 * declarations are the RECORD of what v1 looked like — the thing you need in front of you to read
 * the v1→v2 migration and judge whether it is right. Deleting them because the compiler cannot see a
 * reference deletes the only description of the bytes still being migrated.
 *
 * @module
 */
export type WireUnitV1 =
  | {
      readonly box: 'learning';
      readonly seen: number;
      readonly lastSeen: number;
      readonly streak: number;
    }
  | {
      readonly box: 'understood';
      readonly seen: number;
      readonly lastSeen: number;
      readonly confirmedOn: number;
    };
