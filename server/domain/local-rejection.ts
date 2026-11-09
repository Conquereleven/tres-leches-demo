/**
 * TPL-21: a hosted web payment job ended by this server before any provider
 * call. A failed job or a terminal payment status alone never proves Paymennt
 * was not contacted; only this explicit, corroborated record does.
 */
import type { Job, Payment, State } from "./model";

/** Durable fields that exist only after a provider create was attempted or answered. */
function providerUntouched(p: Payment) {
  return (
    !p.providerReference &&
    !p.providerCheckoutId &&
    !p.url &&
    !p.transactionId &&
    !p.providerRawStatus &&
    !p.directAttempt &&
    !p.providerCreateAttemptedAt &&
    !p.providerDiagnostics?.length
  );
}

/**
 * At claim time (attempts already incremented): this is the job's first and only
 * attempt, it never recorded an error (retryJob resets attempts but keeps
 * lastError), it is the payment's only job and the payment shows no provider trace.
 */
export function provablyUninitiated(
  s: State,
  p: Payment,
  claimed: Pick<Job, "id" | "attempts" | "lastError">,
) {
  return (
    p.checkoutFlow === "web" &&
    p.status === "creating" &&
    claimed.attempts === 1 &&
    claimed.lastError === undefined &&
    providerUntouched(p) &&
    s.jobs.every(
      (j) => j.kind !== "payment" || j.entityId !== p.id || j.id === claimed.id,
    )
  );
}

/** The recorded rejection still matches its job and no provider trace appeared since. */
export function verifiedLocalRejection(s: State, p: Payment) {
  const rejection = p.localRejection;
  if (!rejection || p.status !== "cancelled" || !providerUntouched(p))
    return false;
  const job = s.jobs.find((j) => j.id === rejection.jobId);
  return (
    job?.kind === "payment" &&
    job.entityId === p.id &&
    job.localRejection === rejection.code &&
    s.jobs.every(
      (j) => j.kind !== "payment" || j.entityId !== p.id || j.id === job.id,
    )
  );
}
