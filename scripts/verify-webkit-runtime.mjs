import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Linux WebKit 2359 bundled the libsoup 3.6.5 networking defect tracked in
// microsoft/playwright#42803. Verify the installed CI bundle, not just npm's label.
if (process.platform !== "linux") {
  console.log(
    "Linux-only libsoup verification; native browser QA runs separately.",
  );
} else {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("playwright-core/package.json"));
  const { browsers } = JSON.parse(
    readFileSync(join(root, "browsers.json"), "utf8"),
  );
  const { revision, browserVersion } = browsers.find(
    (b) => b.name === "webkit",
  );
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(homedir(), ".cache/ms-playwright");
  const library = ["minibrowser-wpe", "minibrowser-gtk"]
    .map((name) =>
      join(cache, `webkit-${revision}`, name, "sys/lib/libsoup-3.0.so.0"),
    )
    .find(existsSync);
  if (!library)
    throw new Error("Cannot verify the installed WebKit libsoup library");
  const match = execFileSync("strings", [library], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).match(/^libsoup\/(\d+)\.(\d+)\.(\d+)$/m);
  if (!match) throw new Error("Bundled libsoup version is unavailable");
  const [, major, minor, patch] = match.map(Number);
  if (!(
    major > 3 ||
    (major === 3 && (minor > 6 || (minor === 6 && patch >= 6)))
  )) {
    throw new Error(`Unsafe WebKit networking library: ${match[0]}`);
  }
  console.log(
    JSON.stringify({
      webkitRevision: revision,
      browserVersion,
      libsoup: match[0],
    }),
  );
}
