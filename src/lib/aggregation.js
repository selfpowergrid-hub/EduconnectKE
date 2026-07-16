// Subject-counting (aggregation) policy engine.
//
// A policy row (aggregation_policies) says which of a student's subjects are
// totalled/averaged. rules JSONB, applied top-down:
//   [ { group: 1, take: "all" },      // every subject in group 1
//     { group: 2, take: 2 },          // best 2 by score in group 2
//     { group: 3, take: 1 },
//     { remaining: true, take: 1 } ]  // best 1 not already counted, any group
//
// No policy row, count_all !== false, or an empty rule set → count everything
// (today's behavior, and the default for every school).

/**
 * Select the subjects that count for a student.
 * @param {object|null} policy   aggregation_policies row (or null)
 * @param {Array} entries        [{ score: number, group: number, ...rest }]
 * @returns {{ counted: Array, belowMinimum: boolean, applied: boolean }}
 *   counted      — the entries to total/average (original objects, untouched)
 *   belowMinimum — student sat fewer subjects than policy.min_subjects
 *   applied      — false when the count-all fallback was used
 */
export function applyAggregationPolicy(policy, entries) {
  const all = Array.isArray(entries) ? entries : [];
  const minReq = parseInt(policy?.min_subjects) || 0;
  const belowMinimum = minReq > 0 && all.length < minReq;

  if (!policy || policy.count_all !== false || !Array.isArray(policy.rules) || policy.rules.length === 0) {
    return { counted: all, belowMinimum, applied: false };
  }

  // Highest score first so "best N" is a simple slice.
  const pool = [...all].sort((a, b) => (b.score || 0) - (a.score || 0));
  const counted = [];

  for (const rule of policy.rules) {
    if (rule.remaining) continue; // handled last, after all group rules
    const inGroup = pool.filter(e => (e.group || 1) === rule.group);
    const take = rule.take === "all" ? inGroup.length : Math.min(parseInt(rule.take) || 0, inGroup.length);
    for (const chosen of inGroup.slice(0, take)) {
      counted.push(chosen);
      pool.splice(pool.indexOf(chosen), 1);
    }
  }

  const remainingRule = policy.rules.find(r => r.remaining);
  if (remainingRule) {
    counted.push(...pool.slice(0, parseInt(remainingRule.take) || 0));
  }

  return { counted, belowMinimum, applied: true };
}
