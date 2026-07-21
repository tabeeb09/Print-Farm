import fs from "node:fs";

function parseArgs(argv) {
  const result = { base: "", runtime: ".env.runtime", output: "" };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") result.base = argv[++index] || "";
    if (arg === "--runtime") result.runtime = argv[++index] || result.runtime;
    if (arg === "--output") result.output = argv[++index] || "";
  }

  if (!result.output) {
    throw new Error("--output is required.");
  }

  return result;
}

function parseEnvFile(filePath) {
  const values = {};
  if (!filePath || !fs.existsSync(filePath)) return values;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }

  return values;
}

function toEnvBlock(values) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const merged = {
    ...parseEnvFile(args.base),
    ...parseEnvFile(args.runtime),
  };

  if (process.env.PRINT_APP_BASE_URL) {
    merged.APP_BASE_URL = process.env.PRINT_APP_BASE_URL;
    merged.NEXTAUTH_URL = process.env.PRINT_APP_BASE_URL;
    merged.NEXT_PUBLIC_SITE_URL = process.env.PRINT_APP_BASE_URL;
  }

  if (process.env.PRINT_STRIPE_SECRET_KEY) {
    merged.STRIPE_SECRET_KEY = process.env.PRINT_STRIPE_SECRET_KEY;
  }

  if (process.env.PRINT_STRIPE_WEBHOOK_SECRET) {
    merged.STRIPE_WEBHOOK_SECRET = process.env.PRINT_STRIPE_WEBHOOK_SECRET;
  }

  if (process.env.PRINT_S3_PROJECT_KEY_PREFIX) {
    merged.S3_PROJECT_KEY_PREFIX = process.env.PRINT_S3_PROJECT_KEY_PREFIX;
  }

  fs.writeFileSync(args.output, `${toEnvBlock(merged)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`Prepared print deploy env at ${args.output}`);
}

main();
