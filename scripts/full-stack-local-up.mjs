import fs from "node:fs";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const baseEnvFile = ".env.full.local";
const generatedEnvFile = ".env.full.local.generated";
const openBaoTokenDefault = "dev-only-root-token";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    env[line.slice(0, separator).trim()] = line.slice(separator + 1);
  }

  return env;
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const baseEnv = parseEnvFile(`${rootDir}\\${baseEnvFile}`);
  const baoAddr = process.env.BAO_ADDR || baseEnv.BAO_ADDR || "http://localhost:8200";
  const baoToken = process.env.BAO_TOKEN || baseEnv.BAO_TOKEN || openBaoTokenDefault;

  run("node", ["scripts/fetch-openbao-secrets.mjs"], {
    ...baseEnv,
    BAO_ADDR: baoAddr,
    BAO_TOKEN: baoToken,
  });

  run("node", [
    "scripts/prepare-full-stack-env.mjs",
    "--mode",
    "local",
    "--base",
    baseEnvFile,
    "--runtime",
    ".env.runtime",
    "--output",
    generatedEnvFile,
  ]);

  run("docker", [
    "compose",
    "-f",
    "docker-compose.full.local.yaml",
    "--env-file",
    generatedEnvFile,
    "up",
    "-d",
    "--build",
  ]);

  run("node", ["scripts/init-rustfs-bucket.mjs"], {
    ...baseEnv,
  });

  run("node", ["scripts/upload-site-resources.mjs"], {
    ...baseEnv,
  });
}

main();
