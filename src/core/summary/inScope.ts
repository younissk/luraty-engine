/**
 * Does this unit fall inside the scope being summarised?
 *
 * ⚠️ **EVERY SCOPE PARSES THE KEY, INCLUDING `'all'`**, and the reason is a law rather than tidiness.
 * `summarize` promises that the four per-skill scopes partition the profile exactly — nothing
 * double-counted, nothing dropped. `unitKey(d, v, '')` mints `"recognise:fr:"`, which `parseUnitKey`
 * rejects for having no word; `record` writes whatever key it is handed, so such a unit can reach a
 * profile. If `'all'` counted it and no skill scope could, the partition would silently be off by
 * one for every malformed key present.
 *
 * The alternative — having `'all'` return true unconditionally and calling the law approximate — was
 * rejected: an unaddressable unit is not a unit anybody can act on, so counting it in a headline
 * number is the worse error.
 *
 * @module
 */

import { parseUnitKey, type SummaryScope, type UnitKey } from '../../model/index.js';
import { assertNever } from '../../utils/index.js';

export function inScope(key: UnitKey, scope: SummaryScope): boolean {
  const parts = parseUnitKey(key);
  if (parts === undefined) return false;
  switch (scope.kind) {
    case 'all':
      return true;
    case 'skill': {
      // Matched on the PARSED parts rather than a string prefix. A prefix test would need the
      // caller's variety to be free of colons — true today by construction, and exactly the kind of
      // invariant that stops being true quietly.
      return parts.direction === scope.direction && parts.variety === scope.variety;
    }
    default:
      return assertNever(scope, 'SummaryScope');
  }
}
