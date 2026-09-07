import {
  mkdirSync,
  chmodSync,
  readdirSync,
  statSync,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "./store";
export class BackupManager {
  lastSuccessfulAt?: string;
  failed = false;
  private pending: Promise<void> | null = null;
  constructor(
    private store: Store,
    private dbPath: string,
    private directory: string,
    private retention: number,
    readonly intervalMinutes: number,
  ) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const actualDir = realpathSync(directory),
      actualDbDir = realpathSync(dirname(dbPath));
    if (actualDir === actualDbDir || actualDbDir.startsWith(actualDir + sep))
      throw new Error(
        "Backups require a separate directory that does not contain the database",
      );
    if (
      actualDir.includes(`${sep}dist${sep}`) ||
      actualDir.endsWith(`${sep}dist`)
    )
      throw new Error("Backups cannot be stored in static dist");
    this.directory = actualDir;
  }
  run() {
    if (this.pending) return this.pending;
    this.pending = this.perform().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async perform() {
    try {
      const destination = join(
        this.directory,
        `tl-staging-${Date.now()}-${randomUUID()}.sqlite`,
      );
      if (resolve(destination) === resolve(this.dbPath))
        throw new Error("Invalid backup target");
      await this.store.backup(destination);
      chmodSync(destination, 0o600);
      this.lastSuccessfulAt = new Date().toISOString();
      this.failed = false;
      // Only files owned by this backup naming contract are candidates for retention.
      const files = readdirSync(this.directory)
        .filter((n) => /^tl-staging-\d+-[a-f0-9-]{36}\.sqlite$/.test(n))
        .sort()
        .reverse();
      for (const file of files.slice(this.retention)) {
        const path = join(this.directory, file);
        if (statSync(path).isFile()) unlinkSync(path);
      }
    } catch {
      this.failed = true;
      throw new Error("Backup failed; inspect storage access and integrity");
    }
  }
  status() {
    if (this.failed) return "FAILED" as const;
    return this.lastSuccessfulAt &&
      Date.now() - Date.parse(this.lastSuccessfulAt) <
        this.intervalMinutes * 120000
      ? ("READY" as const)
      : ("BLOCKED" as const);
  }
}
