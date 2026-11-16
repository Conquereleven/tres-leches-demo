// Explicit test-harness clock only. Never imported by src/ or server/.
import { mock } from "node:test";
import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative } from "node:path";
import { tmpdir } from "node:os";
export const CATALOG_FIXTURE_NOW = "2026-11-15T08:00:00.000Z";
export function installCatalogFixtureClock(instant: string) {
  if (!["test", "staging"].includes(process.env.APP_ENV ?? ""))
    throw new Error("Fixture clock requires isolated test or staging mode");
  const db = process.env.DB_PATH;
  const local =
    db && isAbsolute(db)
      ? relative(realpathSync(tmpdir()), realpathSync(dirname(db)))
      : "..";
  if (!local || local.startsWith("..") || isAbsolute(local))
    throw new Error(
      "Fixture clock requires a disposable database under the temporary directory",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instant) ||
    !Number.isFinite(Date.parse(instant)) ||
    new Date(instant).toISOString() !== instant
  )
    throw new Error("Fixture clock requires a valid explicit UTC timestamp");
  mock.timers.enable({ apis: ["Date"], now: new Date(instant) });
}
