import { startServer } from "./http";
try {
  await startServer();
} catch {
  // Configuration failures can contain secrets; never serialize the exception.
  console.error(
    "Server startup blocked: verify private configuration and persistent storage.",
  );
  process.exitCode = 1;
}
