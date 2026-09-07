import { randomBytes, scryptSync } from "node:crypto";
const [id = "liza", role = "admin"] = process.argv.slice(2);
if (
  !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
  !["admin", "manager", "operator"].includes(role)
)
  throw new Error(
    "Usage: operator-password.mjs USER_ID admin|manager|operator < password-on-stdin",
  );
// Read password from stdin to avoid shell history / process-list exposure.
let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (password.length < 12)
  throw new Error("Use a password of at least 12 characters");
const salt = randomBytes(16).toString("hex");
console.log(
  JSON.stringify({
    id,
    role,
    salt,
    hash: scryptSync(password, salt, 64).toString("hex"),
  }),
);
