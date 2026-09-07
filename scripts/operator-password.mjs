import { randomBytes, scryptSync } from "node:crypto";
// Read password from stdin to avoid shell history / process-list exposure.
let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (password.length < 12)
  throw new Error("Use a password of at least 12 characters");
const salt = randomBytes(16).toString("hex");
console.log(
  JSON.stringify({
    id: "liza",
    role: "admin",
    salt,
    hash: scryptSync(password, salt, 64).toString("hex"),
  }),
);
