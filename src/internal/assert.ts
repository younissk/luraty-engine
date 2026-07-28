/**
 * Exhaustiveness checking.
 *
 * Put this in the `default` branch of a switch over a union. The compiler then proves every variant
 * is handled — and the day someone adds a third box to `UnitState`, every switch that forgot about
 * it fails to compile with a message naming the exact variant it forgot. That is a
 * compiler-generated to-do list, and it is the whole reason the state is a union rather than a
 * string with some optional fields.
 *
 * The throw is unreachable if the types are honest. It exists for the case where they are not —
 * data deserialized from an older version, say.
 *
 * @module
 */
export function assertNever(value: never, what: string): never {
  throw new Error(`unhandled ${what}: ${JSON.stringify(value)}`);
}
