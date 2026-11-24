import { discardSessions } from "./sessions";

/**
 * RT01 R1 lifecycle: remove this run's synthetic session-cookie cache so no
 * credential material survives the execution, even on a shared runner.
 */
export default async function globalTeardown(): Promise<void> {
  discardSessions();
}
