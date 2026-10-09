import { DatabaseSync, backup } from "node:sqlite";
import { resolve } from "node:path";
import { existsSync, chmodSync } from "node:fs";
const [source, destination] = process.argv.slice(2);
if (
  !source ||
  !destination ||
  !existsSync(source) ||
  existsSync(destination) ||
  resolve(source) === resolve(destination)
)
  throw new Error("Usage: node scripts/backup.mjs EXISTING_DB NEW_BACKUP_PATH");
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  chmodSync(destination, 0o600);
  const check = new DatabaseSync(destination, { readOnly: true });
  try {
    if (check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw new Error("Backup integrity failed");
  } finally {
    check.close();
  }
  console.log(JSON.stringify({ event: "backup.complete", integrity: "ok" }));
} finally {
  db.close();
}
