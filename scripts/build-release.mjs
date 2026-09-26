import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");

export function validateApiOrigin(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error("NEXT_PUBLIC_API_SERVER must be an HTTPS API origin.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_API_SERVER must be a valid URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_SERVER must be an HTTPS origin without credentials, path, query, or fragment.",
    );
  }

  const host = url.hostname.toLowerCase();
  // EN: Public environment values are baked into browser assets, so a loopback API must not pass a release build.
  // FI: Julkiset ympäristöarvot paketoidaan selaintiedostoihin, joten paikallinen API-osoite ei saa läpäistä julkaisuversiota.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\./.test(host)
  ) {
    throw new Error("NEXT_PUBLIC_API_SERVER must not use a loopback host.");
  }

  return url.origin;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    validateApiOrigin(process.env.NEXT_PUBLIC_API_SERVER);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }

  if (process.exitCode !== 1) {
    if (process.argv.includes("--check")) {
      console.log("Release API origin is valid; reachability is not checked.");
    } else {
      const nextCli = resolve(projectRoot, "node_modules/next/dist/bin/next");
      const result = spawnSync(process.execPath, [nextCli, "build"], {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
      });
      if (result.error) console.error(result.error.message);
      process.exitCode = result.status ?? 1;
    }
  }
}
