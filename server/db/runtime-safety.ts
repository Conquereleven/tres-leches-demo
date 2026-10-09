import type { State } from "../domain/model";
// Provenance checks deliberately avoid guessing from customer names or ordinary prices.
export function runtimeFindings(state: State): string[] {
  const findings: string[] = [];
  for (const c of state.conversations) {
    if (
      c.messages.some(
        (m) =>
          m.id === `seed-${c.sourceNumberId}` ||
          m.id.startsWith("TEST-MESSAGE-"),
      ) ||
      c.audit.some((a) => a.actor === "staging-seed")
    )
      findings.push(`conversation:${c.id}`);
  }
  for (const o of state.orders) {
    if (
      o.audit.some((a) => a.actor === "staging-seed") ||
      findings.includes(`conversation:${o.conversationId}`)
    )
      findings.push(`order:${o.id}`);
  }
  for (const p of state.payments) {
    if (
      p.provider === "mock" ||
      p.providerReference?.startsWith("mock-pay-") ||
      findings.includes(`order:${p.orderId}`)
    )
      findings.push(`payment:${p.id}`);
  }
  if (state.uatScenarios?.length) findings.push("uat-scenarios");
  return findings;
}
export function assertCleanRuntime(state: State) {
  if (runtimeFindings(state).length)
    throw new Error(
      "Database contains identified test records. Quarantine and review offline; no records were deleted.",
    );
}
