#!/usr/bin/env node
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(repoRoot, ".generated", "hetzner");
const args = process.argv.slice(2);

function commandExists(command) {
  const result =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { stdio: "ignore" })
      : spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
  return result.status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result;
}

function runTerraform(args, infraDir, options = {}) {
  return run("terraform", args, { ...options, cwd: infraDir });
}

function randomB64Url(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function encryptJson(payload, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 310_000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload, null, 2));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    kdf: "pbkdf2-sha256",
    iterations: 310_000,
    cipher: "aes-256-gcm",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function writePrivateFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

async function prompt(rl, label, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || defaultValue;
}

function readJsonFile(filePath) {
  if (!filePath) {
    return {};
  }

  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8").replace(/^\uFEFF/, ""));
}

function readGoogleOAuthClient(filePath) {
  if (!filePath) {
    return {};
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Google OAuth client secrets file was not found: ${filePath}`);
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  const client = payload.web ?? payload.installed ?? payload;
  const clientId = client.client_id ?? client.clientId ?? "";
  const clientSecret = client.client_secret ?? client.clientSecret ?? "";

  if (!clientId || !clientSecret) {
    throw new Error(`Google OAuth client secrets file is missing client_id/client_secret: ${filePath}`);
  }

  return { clientId, clientSecret };
}

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(`--${name}`);
  if (index >= 0) {
    return args[index + 1];
  }

  return undefined;
}

function boolFromConfig(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

function isIpv4(value) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value);
}

async function detectPublicIpv4() {
  const endpoints = ["https://api.ipify.org", "https://ifconfig.me/ip"];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        continue;
      }

      const ip = (await response.text()).trim();
      if (isIpv4(ip)) {
        return ip;
      }
    } catch {
      // Try the next endpoint. If all fail, the caller falls back to a manual value.
    }
  }

  return "";
}

async function cloudflareRequest({ apiToken, method, path, body }) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const message = payload.errors?.map((error) => error.message).join("; ") || response.statusText;
    throw new Error(`Cloudflare API ${method} ${path} failed: ${message}`);
  }

  return payload;
}

async function hcloudRequest({ apiToken, path }) {
  const response = await fetch(`https://api.hetzner.cloud/v1${path}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error?.message || response.statusText;
    throw new Error(`Hetzner API GET ${path} failed: ${message}`);
  }

  return payload;
}

function serverTypeArchitecture(serverType) {
  const architecture = String(serverType.architecture ?? serverType.cpu_type ?? "").toLowerCase();
  const name = String(serverType.name ?? "").toLowerCase();

  if (architecture.includes("arm") || name.startsWith("cax")) {
    return "arm";
  }

  return "x86";
}

function serverTypeAvailableInLocation(serverType, location) {
  const locationEntry = serverType.locations?.find((entry) => entry.location?.name === location || entry.name === location);
  if (!locationEntry) {
    return false;
  }

  return locationEntry.available !== false;
}

function serverTypeMonthlyPrice(serverType, location) {
  const price = serverType.prices?.find((entry) => entry.location === location) ?? serverType.prices?.[0];
  const value = price?.price_monthly?.net ?? price?.price_monthly?.gross ?? price?.price_hourly?.net ?? price?.price_hourly?.gross;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

async function resolveHetznerServerType({ apiToken, location, requestedType, allowArm }) {
  const normalized = String(requestedType || "auto").toLowerCase();
  const shouldAuto = ["auto", "cheapest", "cheapest-available"].includes(normalized);
  const payload = await hcloudRequest({ apiToken, path: "/server_types?per_page=100" });
  const serverTypes = payload.server_types ?? [];
  const available = serverTypes.filter((serverType) => serverTypeAvailableInLocation(serverType, location));
  const architectureFiltered = allowArm ? available : available.filter((serverType) => serverTypeArchitecture(serverType) === "x86");

  if (!shouldAuto) {
    const requested = available.find((serverType) => serverType.name === requestedType);
    if (requested && (allowArm || serverTypeArchitecture(requested) === "x86")) {
      return requestedType;
    }

    console.log(`Hetzner server type '${requestedType}' is not available in '${location}'. Falling back to cheapest available type.`);
  }

  const candidates = architectureFiltered.length > 0 ? architectureFiltered : available;
  candidates.sort((a, b) => serverTypeMonthlyPrice(a, location) - serverTypeMonthlyPrice(b, location));
  const selected = candidates[0];
  if (!selected) {
    throw new Error(`No Hetzner server types are available in ${location}. Try another location such as nbg1 or hel1.`);
  }

  console.log(
    `Selected Hetzner server type '${selected.name}' in '${location}' (${serverTypeArchitecture(selected)}, monthly price key ${serverTypeMonthlyPrice(selected, location)}).`,
  );
  return selected.name;
}

async function resolveCloudflareZoneId({ apiToken, zoneId, zoneName }) {
  if (zoneId) {
    return zoneId;
  }

  const payload = await cloudflareRequest({
    apiToken,
    method: "GET",
    path: `/zones?name=${encodeURIComponent(zoneName)}`,
  });
  const resolved = payload.result?.[0]?.id;
  if (!resolved) {
    throw new Error(`Cloudflare zone was not found for ${zoneName}. Provide cloudflareZoneId explicitly.`);
  }
  return resolved;
}

async function upsertCloudflareARecord({ apiToken, zoneId, name, ip, proxied = false, ttl = 120 }) {
  const query = `/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`;
  const existing = await cloudflareRequest({ apiToken, method: "GET", path: query });
  const current = existing.result?.[0];
  const payload = {
    type: "A",
    name,
    content: ip,
    ttl,
    proxied,
  };

  if (current) {
    await cloudflareRequest({
      apiToken,
      method: "PUT",
      path: `/zones/${zoneId}/dns_records/${current.id}`,
      body: payload,
    });
  } else {
    await cloudflareRequest({
      apiToken,
      method: "POST",
      path: `/zones/${zoneId}/dns_records`,
      body: payload,
    });
  }
}

async function promptConfig(rl, config, key, label, defaultValue = "") {
  if (Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined && config[key] !== null) {
    return String(config[key]);
  }

  return prompt(rl, label, defaultValue);
}

async function promptAdminCidr(rl, config) {
  const configured = config.adminCidr ?? "";
  const shouldAutoDetect =
    !configured || String(configured).toLowerCase() === "auto" || configured === "203.0.113.10/32";

  if (!shouldAutoDetect) {
    return String(configured);
  }

  const publicIp = await detectPublicIpv4();
  const detectedCidr = publicIp ? `${publicIp}/32` : "";
  const fallback = detectedCidr || "0.0.0.0/0";

  if (detectedCidr) {
    console.log(`Detected current admin public IP: ${detectedCidr}`);
  } else {
    console.log("Could not auto-detect current public IP. Replace the admin CIDR before production use.");
  }

  return prompt(rl, "Admin CIDR allowed to SSH/CAId", fallback);
}

async function promptSecretConfig(rl, config, key, label, required = true) {
  if (Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined && config[key] !== null) {
    return String(config[key]);
  }

  return promptSecret(rl, label, required);
}

async function promptSecret(rl, label, required = true) {
  const value = (await rl.question(`${label}${required ? "" : " (blank to skip)"}: `)).trim();
  if (required && !value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function ensureSshKey(keyPath) {
  const publicKeyPath = `${keyPath}.pub`;

  if (!fs.existsSync(keyPath) || !fs.existsSync(publicKeyPath)) {
    run("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", "hetzner-bootstrap", "-f", keyPath]);
  }

  return {
    privateKeyPath: keyPath,
    publicKey: fs.readFileSync(publicKeyPath, "utf8").trim(),
  };
}

function writeEnvFile(filePath, values) {
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value ?? "")}`)
    .join("\n");
  writePrivateFile(filePath, `${body}\n`);
}

function parseEnvContent(content) {
  const values = {};
  for (const rawLine of String(content ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsAt = line.indexOf("=");
    if (equalsAt <= 0) continue;
    values[line.slice(0, equalsAt)] = line.slice(equalsAt + 1);
  }
  return values;
}

function isValidOauth2CookieSecret(value) {
  return [16, 24, 32].includes(Buffer.byteLength(String(value ?? ""), "utf8"));
}

function shellQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "'\"'\"'")}'`;
}

function writeShellEnvFile(filePath, values) {
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join("\n");
  writePrivateFile(filePath, `${body}\n`);
}

function githubRepositoryFromUrl(repoUrl) {
  const withoutGit = repoUrl.replace(/\.git$/i, "");
  const sshMatch = withoutGit.match(/github\.com[:/]([^/]+\/[^/]+)$/i);
  if (sshMatch) {
    return sshMatch[1];
  }

  try {
    const url = new URL(withoutGit);
    if (url.hostname.toLowerCase() === "github.com") {
      return url.pathname.replace(/^\/+/, "");
    }
  } catch {
    // Fall through to a safe default below.
  }

  return "tabeeb09/oi.loftrop.com";
}

function installRemoteFile({ host, keyPath, localPath, remotePath }) {
  run("scp", ["-i", keyPath, "-o", "StrictHostKeyChecking=accept-new", localPath, `root@${host}:${remotePath}`]);
}

function ssh({ host, keyPath, command }) {
  run("ssh", ["-i", keyPath, "-o", "StrictHostKeyChecking=accept-new", `root@${host}`, command]);
}

function sshCapture({ host, keyPath, command }) {
  const result = spawnSync(
    "ssh",
    ["-i", keyPath, "-o", "StrictHostKeyChecking=accept-new", `root@${host}`, command],
    {
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `ssh command failed with exit code ${result.status}`);
  }

  return result.stdout;
}

function terraformOutputJson(infraDir) {
  const result = spawnSync("terraform", ["output", "-json"], {
    cwd: infraDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "terraform output failed");
  }

  const raw = JSON.parse(result.stdout);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value.value]));
}

function dnsRecordsForLayout(layout, outputs, domains) {
  const websiteIp = layout === "single" ? outputs.single_ipv4 : outputs.website_ipv4;
  const websiteAliases = (domains.websiteAliasHosts ?? []).map((host) => [host, websiteIp]);

  if (layout === "single") {
    return [
      [domains.appHost, outputs.single_ipv4],
      ...websiteAliases,
      [domains.authHost, outputs.single_ipv4],
      [domains.baoHost, outputs.single_ipv4],
      [domains.mediaHost, outputs.single_ipv4],
      [domains.oauth2Host, outputs.single_ipv4],
      [domains.rustfsAdminHost, outputs.single_ipv4],
    ];
  }

  return [
    [domains.authHost, outputs.caid_ipv4],
    [domains.baoHost, outputs.caid_ipv4],
    [domains.appHost, outputs.website_ipv4],
    ...websiteAliases,
    [domains.mediaHost, outputs.storage_ipv4],
    [domains.oauth2Host, outputs.website_ipv4],
    [domains.rustfsAdminHost, outputs.storage_ipv4],
  ];
}

async function hostResolvesTo(hostname, expectedIp) {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) },
    );
    if (response.ok) {
      const payload = await response.json();
      const answers = payload.Answer ?? [];
      if (answers.some((answer) => answer.type === 1 && answer.data === expectedIp)) {
        return true;
      }
    }
  } catch {
    // Fall back to the host resolver below.
  }

  try {
    const records = await lookup(hostname, { all: true, family: 4 });
    return records.some((record) => record.address === expectedIp);
  } catch {
    return false;
  }
}

async function waitForDnsIfNeeded(rl, layout, outputs, domains, waitForDns) {
  const records = dnsRecordsForLayout(layout, outputs, domains);
  const maxAutoAttempts = 20;
  const retrySeconds = 15;

  console.log("");
  console.log("Required DNS A records:");
  for (const [host, ip] of records) {
    console.log(`  ${host} -> ${ip}`);
  }
  console.log("");

  if (!waitForDns) {
    console.log("Skipping DNS wait because waitForDns is false.");
    return;
  }

  for (let attempt = 1; ; attempt++) {
    const checks = await Promise.all(records.map(async ([host, ip]) => [host, ip, await hostResolvesTo(host, ip)]));
    const missing = checks.filter(([, , ok]) => !ok);

    if (missing.length === 0) {
      console.log("DNS records resolve to the expected VPS IPs.");
      return;
    }

    console.log("DNS propagation is not visible yet for:");
    for (const [host, ip] of missing) {
      console.log(`  ${host} -> ${ip}`);
    }

    if (attempt <= maxAutoAttempts) {
      console.log(`Cloudflare was updated. Waiting ${retrySeconds}s before re-check ${attempt}/${maxAutoAttempts}...`);
      await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
      continue;
    }

    const answer = (
      await prompt(rl, "DNS still has not propagated. Press Enter to re-check, or type skip to continue anyway", "")
    ).toLowerCase();
    if (answer === "skip") {
      console.log("Continuing without confirmed DNS. HTTPS/domain-dependent setup may fail.");
      return;
    }
  }
}

async function updateCloudflareDnsIfConfigured({ layout, outputs, domains, cloudflare }) {
  if (!cloudflare.apiToken) {
    console.log("Cloudflare DNS automation not configured.");
    return;
  }

  const zoneId = await resolveCloudflareZoneId({
    apiToken: cloudflare.apiToken,
    zoneId: cloudflare.zoneId,
    zoneName: cloudflare.zoneName,
  });
  const records = dnsRecordsForLayout(layout, outputs, domains);
  const proxied = cloudflare.proxied;
  const ttl = cloudflare.ttl;

  console.log("Updating Cloudflare DNS A records...");
  for (const [host, ip] of records) {
    await upsertCloudflareARecord({ apiToken: cloudflare.apiToken, zoneId, name: host, ip, proxied, ttl });
    console.log(`  ${host} -> ${ip}`);
  }
}

async function main() {
  if (!commandExists("terraform")) {
    throw new Error("Terraform is required. Run this through scripts/bootstrap-hetzner-project.ps1 or .sh.");
  }
  if (!commandExists("ssh-keygen")) {
    throw new Error("ssh-keygen is required on PATH.");
  }
  if (!commandExists("ssh")) {
    throw new Error("ssh is required on PATH.");
  }

  fs.mkdirSync(generatedDir, { recursive: true });
  const configPath = argValue("config") || argValue("config-file");
  const config = readJsonFile(configPath);
  const googleOAuthFile =
    argValue("google-client-secrets-file") ||
    argValue("google-client-secret-file") ||
    config.googleClientSecretsFile ||
    config.googleClientSecretFile ||
    config.googleSecretsFile ||
    "";
  const googleOAuthClient = readGoogleOAuthClient(googleOAuthFile);

  const rl = readline.createInterface({ input, output });
  try {
    if (configPath) {
      console.log(`Loaded reusable bootstrap config: ${path.resolve(configPath)}`);
    }

    const masterPassword = await promptSecretConfig(
      rl,
      config,
      "masterSetupPassword",
      "Master setup password for encrypted local recovery bundle",
    );
    const confirmPassword = config.masterSetupPassword
      ? masterPassword
      : await promptSecret(rl, "Confirm master setup password");
    if (masterPassword !== confirmPassword) {
      throw new Error("Master setup passwords did not match.");
    }

    const hcloudToken = await promptSecretConfig(rl, config, "hcloudToken", "Hetzner Cloud API token");
    const layout = await promptConfig(rl, config, "layout", "Deployment layout: single or split", "single");
    if (!["single", "split"].includes(layout)) {
      throw new Error("Deployment layout must be 'single' or 'split'.");
    }
    const infraDir = path.join(repoRoot, "infra", layout === "single" ? "hetzner-single" : "hetzner");
    const projectName = await promptConfig(rl, config, "projectName", "Project/resource name", "oi-loftrop");
    const baseDomain = await promptConfig(rl, config, "baseDomain", "Base domain", "loftrop.com");
    const appHost = await promptConfig(rl, config, "appHost", "Public website hostname", `oi.${baseDomain}`);
    const websiteAliasHosts = String(config.websiteAliasHosts ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);
    const authHost = await promptConfig(rl, config, "authHost", "Keycloak/Auth hostname", `auth.${baseDomain}`);
    const baoHost = await promptConfig(rl, config, "baoHost", "OpenBao hostname", `bao.${baseDomain}`);
    const mediaHost = await promptConfig(rl, config, "mediaHost", "Public media hostname", `media.${baseDomain}`);
    const oauth2Host = await promptConfig(rl, config, "oauth2Host", "OAuth2 proxy hostname", `oauth2.${baseDomain}`);
    const rustfsAdminHost = await promptConfig(
      rl,
      config,
      "rustfsAdminHost",
      "RustFS admin hostname",
      `rustfs-admin.${baseDomain}`,
    );
    const adminCidr = await promptAdminCidr(rl, config);
    const location = await promptConfig(rl, config, "location", "Hetzner location", "fsn1");
    const requestedServerType = await promptConfig(rl, config, "serverType", "Default server type, or auto", "auto");
    const allowArmServerTypes = boolFromConfig(config.allowArmServerTypes, false);
    const serverType = await resolveHetznerServerType({
      apiToken: hcloudToken,
      location,
      requestedType: requestedServerType,
      allowArm: allowArmServerTypes,
    });
    const websiteRepoUrl = await promptConfig(
      rl,
      config,
      "websiteRepoUrl",
      "Website code repository URL",
      "https://github.com/tabeeb09/oi.loftrop.com.git",
    );
    const websiteRepoRef = await promptConfig(rl, config, "websiteRepoRef", "Website repository branch/ref", "main");
    const caidRepoUrl = await promptConfig(
      rl,
      config,
      "caidRepoUrl",
      "CAId repository URL",
      "https://github.com/tabeeb09/caid.git",
    );
    const caidRepoRef = await promptConfig(rl, config, "caidRepoRef", "CAId repository branch/ref", "main");
    const initialOwnerEmail = await promptConfig(
      rl,
      config,
      "initialOwnerEmail",
      "Initial website owner email",
      `owner@${baseDomain}`,
    );
    const googleClientId =
      config.googleClientId || googleOAuthClient.clientId
        ? String(config.googleClientId || googleOAuthClient.clientId)
        : await promptConfig(rl, config, "googleClientId", "Google OAuth client ID", "");
    const googleClientSecret =
      config.googleClientSecret || googleOAuthClient.clientSecret
        ? String(config.googleClientSecret || googleOAuthClient.clientSecret)
        : await promptSecretConfig(rl, config, "googleClientSecret", "Google OAuth client secret", false);
    const allowedEmails = await promptConfig(
      rl,
      config,
      "allowedEmails",
      "Allowed emails/domains, comma-separated",
      "",
    );
    const githubToken = await promptSecretConfig(
      rl,
      config,
      "githubToken",
      "GitHub token for runner auto-registration and repo variables (blank to skip)",
      false,
    );
    const dnsProvider = await promptConfig(rl, config, "dnsProvider", "DNS provider: none or cloudflare", "none");
    if (!["none", "cloudflare"].includes(dnsProvider)) {
      throw new Error("dnsProvider must be 'none' or 'cloudflare'.");
    }
    let cloudflareApiToken = "";
    let cloudflareZoneName = baseDomain;
    let cloudflareZoneId = "";
    if (dnsProvider === "cloudflare") {
      cloudflareApiToken =
        config.cloudflareApiToken || config.cloudflareApiToken === ""
          ? String(config.cloudflareApiToken)
          : await promptSecret(rl, "Cloudflare API token with Zone:DNS:Edit");
      if (!cloudflareApiToken) {
        cloudflareApiToken = await promptSecret(rl, "Cloudflare API token with Zone:DNS:Edit");
      }
      cloudflareZoneName = await promptConfig(rl, config, "cloudflareZoneName", "Cloudflare zone name", baseDomain);
      cloudflareZoneId = await promptConfig(rl, config, "cloudflareZoneId", "Cloudflare zone ID (blank to auto-detect)", "");
    }
    const cloudflareProxied = boolFromConfig(config.cloudflareProxied, false);
    const cloudflareTtl = Number(config.cloudflareTtl ?? 120);
    const githubRepository = await promptConfig(
      rl,
      config,
      "githubRepository",
      "GitHub repository for self-hosted runner",
      githubRepositoryFromUrl(websiteRepoUrl),
    );
    const applyNow =
      config.applyNow === undefined
        ? (await prompt(rl, "Run terraform apply now? yes/no", "yes")).toLowerCase() === "yes"
        : boolFromConfig(config.applyNow, true);
    const configureNow =
      config.configureNow === undefined
        ? (await prompt(rl, "SSH into created VPSes and run setup after apply? yes/no", "yes")).toLowerCase() === "yes"
        : boolFromConfig(config.configureNow, true);
    const waitForDns =
      config.waitForDns === undefined
        ? true
        : boolFromConfig(config.waitForDns, true);

    const keyPath = path.join(generatedDir, "hetzner-bootstrap-ed25519");
    const sshKey = ensureSshKey(keyPath);

    const domains = {
      appHost,
      websiteAliasHosts,
      authHost,
      baoHost,
      mediaHost,
      oauth2Host,
      rustfsAdminHost,
      appUrl: `https://${appHost}`,
      mediaUrl: `https://${mediaHost}`,
      oauth2Url: `https://${oauth2Host}`,
    };

    const generatedSecrets = {
      keycloakBootstrapAdminPassword: randomB64Url(24),
      keycloakDbPassword: randomB64Url(32),
      initialOwnerPassword: randomB64Url(24),
      websiteAuthSecret: randomB64Url(48),
      websiteClientSecret: randomB64Url(32),
      websiteAdminSyncClientSecret: randomB64Url(32),
      oauth2ProxyClientSecret: randomB64Url(32),
      rustfsAccessKeyId: `rustfs-${randomB64Url(18)}`,
      rustfsSecretAccessKey: randomB64Url(32),
      oauth2ProxyCookieSecret: crypto.randomBytes(16).toString("hex"),
    };

    const tfvars = {
      hcloud_token: hcloudToken,
      project_name: projectName,
      location,
      ...(layout === "single"
        ? { server_type: serverType }
        : {
            caid_server_type: serverType,
            storage_server_type: serverType,
            website_server_type: serverType,
          }),
      admin_cidr: adminCidr,
      ssh_public_key: sshKey.publicKey,
      website_repo_url: websiteRepoUrl,
      website_repo_ref: websiteRepoRef,
      caid_repo_url: caidRepoUrl,
      caid_repo_ref: caidRepoRef,
    };

    const tfvarsPath = path.join(generatedDir, "terraform.tfvars.json");
    writePrivateFile(tfvarsPath, JSON.stringify(tfvars, null, 2));

    const recoveryBundle = {
      generatedAt: new Date().toISOString(),
      projectName,
      layout,
      baseDomain,
      domains,
      adminCidr,
      initialOwnerEmail,
      websiteRepoUrl,
      websiteRepoRef,
      caidRepoUrl,
      caidRepoRef,
      githubRepository,
      dnsProvider,
      cloudflare: cloudflareApiToken
        ? {
            zoneName: cloudflareZoneName,
            zoneId: cloudflareZoneId || undefined,
            apiToken: cloudflareApiToken,
            proxied: cloudflareProxied,
            ttl: cloudflareTtl,
          }
        : undefined,
      googleClientId: googleClientId || undefined,
      googleClientSecret: googleClientSecret || undefined,
      allowedEmails: allowedEmails || undefined,
      sshPrivateKeyPath: sshKey.privateKeyPath,
      sshPublicKey: sshKey.publicKey,
      generatedSecrets,
    };

    const encryptedPath = path.join(generatedDir, "bootstrap-secrets.enc.json");
    writePrivateFile(encryptedPath, JSON.stringify(encryptJson(recoveryBundle, masterPassword), null, 2));

    console.log(`Encrypted bootstrap recovery bundle written to ${encryptedPath}`);
    console.log(`Terraform variables written to ${tfvarsPath}`);

    if (!applyNow) {
      console.log(`Next: cd ${infraDir} && terraform init && terraform apply -var-file="${tfvarsPath}"`);
      return;
    }

    runTerraform(["init"], infraDir);
    runTerraform(["apply", "-auto-approve", `-var-file=${tfvarsPath}`], infraDir);

    const outputs = terraformOutputJson(infraDir);
    const outputsPath = path.join(generatedDir, "terraform-outputs.json");
    writePrivateFile(outputsPath, JSON.stringify(outputs, null, 2));
    console.log(`Terraform outputs written to ${outputsPath}`);

    await updateCloudflareDnsIfConfigured({
      layout,
      outputs,
      domains,
      cloudflare: {
        apiToken: cloudflareApiToken,
        zoneId: cloudflareZoneId,
        zoneName: cloudflareZoneName,
        proxied: cloudflareProxied,
        ttl: cloudflareTtl,
      },
    });

    if (!configureNow) {
      await waitForDnsIfNeeded(rl, layout, outputs, domains, false);
      return;
    }

    await waitForDnsIfNeeded(rl, layout, outputs, domains, waitForDns);

    const caidHost = layout === "single" ? outputs.single_ipv4 : outputs.caid_ipv4;
    const storageHost = layout === "single" ? outputs.single_ipv4 : outputs.storage_ipv4;
    const websiteHost = layout === "single" ? outputs.single_ipv4 : outputs.website_ipv4;

    const existingCaidEnv = parseEnvContent(
      sshCapture({
        host: caidHost,
        keyPath,
        command: "test -f /etc/caid/caid.env && cat /etc/caid/caid.env || true",
      }),
    );
    const keepExisting = (key, fallback) => existingCaidEnv[key] || fallback;

    const caidEnvPath = path.join(generatedDir, "caid.env");
    writeEnvFile(caidEnvPath, {
      AUTH_HOST: domains.authHost,
      BAO_HOST: domains.baoHost,
      ZTNA_PROVIDER: "none",
      VPN_CIDR: adminCidr,
      KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME: "admin",
      KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD: keepExisting(
        "KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD",
        generatedSecrets.keycloakBootstrapAdminPassword,
      ),
      KEYCLOAK_DB_PASSWORD: keepExisting("KEYCLOAK_DB_PASSWORD", generatedSecrets.keycloakDbPassword),
      INITIAL_OWNER_USERNAME: "owner",
      INITIAL_OWNER_EMAIL: initialOwnerEmail,
      INITIAL_OWNER_PASSWORD: keepExisting("INITIAL_OWNER_PASSWORD", generatedSecrets.initialOwnerPassword),
      APP_PUBLIC_URL: domains.appUrl,
      MEDIA_PUBLIC_URL: domains.mediaUrl,
      OAUTH2_PROXY_PUBLIC_URL: domains.oauth2Url,
      RUSTFS_BUCKET: "public-media",
      GOOGLE_CLIENT_ID: googleClientId || existingCaidEnv.GOOGLE_CLIENT_ID || "",
      GOOGLE_CLIENT_SECRET: googleClientSecret || existingCaidEnv.GOOGLE_CLIENT_SECRET || "",
      ALLOWED_EMAILS: allowedEmails,
      DNS_PROVIDER: dnsProvider,
      CLOUDFLARE_ZONE_NAME: cloudflareZoneName,
      CLOUDFLARE_ZONE_ID: cloudflareZoneId,
      CLOUDFLARE_API_TOKEN: cloudflareApiToken || existingCaidEnv.CLOUDFLARE_API_TOKEN || "",
      CLOUDFLARE_PROXIED: String(cloudflareProxied),
      CLOUDFLARE_TTL: String(cloudflareTtl),
      WEBSITE_AUTH_SECRET: keepExisting("WEBSITE_AUTH_SECRET", generatedSecrets.websiteAuthSecret),
      WEBSITE_CLIENT_SECRET: keepExisting("WEBSITE_CLIENT_SECRET", generatedSecrets.websiteClientSecret),
      WEBSITE_ADMIN_SYNC_CLIENT_SECRET: keepExisting(
        "WEBSITE_ADMIN_SYNC_CLIENT_SECRET",
        generatedSecrets.websiteAdminSyncClientSecret,
      ),
      OAUTH2_PROXY_CLIENT_SECRET: keepExisting(
        "OAUTH2_PROXY_CLIENT_SECRET",
        generatedSecrets.oauth2ProxyClientSecret,
      ),
      RUSTFS_ACCESS_KEY_ID: keepExisting("RUSTFS_ACCESS_KEY_ID", generatedSecrets.rustfsAccessKeyId),
      RUSTFS_SECRET_ACCESS_KEY: keepExisting("RUSTFS_SECRET_ACCESS_KEY", generatedSecrets.rustfsSecretAccessKey),
      OAUTH2_PROXY_COOKIE_SECRET: isValidOauth2CookieSecret(existingCaidEnv.OAUTH2_PROXY_COOKIE_SECRET)
        ? existingCaidEnv.OAUTH2_PROXY_COOKIE_SECRET
        : generatedSecrets.oauth2ProxyCookieSecret,
    });

    console.log("Configuring CAId VPS...");
    installRemoteFile({
      host: caidHost,
      keyPath,
      localPath: caidEnvPath,
      remotePath: "/tmp/caid.env",
    });
    const caidSetupOutput = sshCapture({
      host: caidHost,
      keyPath,
      command:
        "mkdir -p /etc/caid && install -m 600 -o root -g root /tmp/caid.env /etc/caid/caid.env && cd /srv/caid && bash scripts/setup-caid-vps.sh",
    });
    console.log(caidSetupOutput);

    const approle = {
      BAO_ADDR: caidSetupOutput.match(/^BAO_ADDR=(.+)$/m)?.[1],
      OPENBAO_ROLE_ID: caidSetupOutput.match(/^OPENBAO_ROLE_ID=(.+)$/m)?.[1],
      OPENBAO_SECRET_ID: caidSetupOutput.match(/^OPENBAO_SECRET_ID=(.+)$/m)?.[1],
    };

    if (!approle.BAO_ADDR || !approle.OPENBAO_ROLE_ID || !approle.OPENBAO_SECRET_ID) {
      throw new Error("Could not parse AppRole credentials from CAId setup output.");
    }

    const approlePath = path.join(generatedDir, "openbao-bootstrap.env");
    writeEnvFile(approlePath, approle);

    const remoteStorageBaseEnv = [
      `APP_HOST=${domains.appHost}`,
      `MEDIA_HOST=${domains.mediaHost}`,
      `RUSTFS_ADMIN_HOST=${domains.rustfsAdminHost}`,
      `OAUTH2_PROXY_HOST=${domains.oauth2Host}`,
      `APP_HTTP_PORT=${layout === "single" ? "8081" : "80"}`,
      `APP_HTTPS_PORT=${layout === "single" ? "8443" : "443"}`,
      `RUSTFS_HTTP_PORT=${layout === "single" ? "8082" : "80"}`,
      `RUSTFS_HTTPS_PORT=${layout === "single" ? "9443" : "443"}`,
      `NEXT_PUBLIC_SITE_URL=${domains.appUrl}`,
      `NEXT_PUBLIC_MEDIA_BASE_URL=${domains.mediaUrl}`,
      `NEXTAUTH_URL=${domains.appUrl}`,
      `S3_ENDPOINT=${layout === "single" ? "http://rustfs:9000" : domains.mediaUrl}`,
      `S3_PUBLIC_ENDPOINT=${domains.mediaUrl}`,
      "S3_BUCKET=public-media",
      "S3_PRIVATE_BUCKET=private-user-files",
      "S3_REGION=us-east-1",
      `KEYCLOAK_ISSUER=https://${domains.authHost}/realms/website`,
      "KEYCLOAK_ASSET_ADMIN_ROLES=owner,asset_admin",
      `BAO_ADDR=https://${domains.baoHost}`,
      "BAO_KV_MOUNT=kv",
      "BAO_SECRET_PATH_WEBSITE=website/prod",
      "BAO_SECRET_PATH_RUSTFS=rustfs/prod",
      "BAO_SECRET_PATH_OAUTH2_PROXY=oauth2-proxy/prod",
      "BAO_SECRET_PATH_KEYCLOAK=keycloak/prod",
      "WEBSITE_IMAGE=ghcr.io/tabeeb09/print-farm:latest",
      "OAUTH2_PROXY_ALLOWED_ROLE=infra_admin",
      `OAUTH2_PROXY_REDIRECT_URL=${domains.oauth2Url}/oauth2/callback`,
      "",
    ].join("\n");

    const baseEnvPath = path.join(generatedDir, "website-base.env");
    writePrivateFile(baseEnvPath, remoteStorageBaseEnv);

    for (const [role, host] of [
      ["storage", storageHost],
      ["website", websiteHost],
    ]) {
      console.log(`Uploading base env to ${role} VPS...`);
      installRemoteFile({
        host,
        keyPath,
        localPath: baseEnvPath,
        remotePath: "/tmp/base.env",
      });
      ssh({
        host,
        keyPath,
        command: "mkdir -p /etc/website && install -m 600 -o root -g root /tmp/base.env /etc/website/base.env",
      });
      installRemoteFile({
        host,
        keyPath,
        localPath: approlePath,
        remotePath: "/tmp/openbao-bootstrap.env",
      });
      ssh({
        host,
        keyPath,
        command:
          "install -m 600 -o root -g root /tmp/openbao-bootstrap.env /etc/website/openbao-bootstrap.env",
      });
    }

    if (layout === "single") {
      console.log("Starting RustFS, website, and single-VPS gateway routing...");
      ssh({
        host: websiteHost,
        keyPath,
        command:
          "cd /srv/website/app && bash scripts/website-stack-vps.sh bootstrap && RUSTFS_EXTRA_COMPOSE_FILES='' bash scripts/website-stack-vps.sh rustfs && APP_EXTRA_COMPOSE_FILES='' bash scripts/website-stack-vps.sh app",
      });
      ssh({
        host: websiteHost,
        keyPath,
        command: `cd /srv/website/app && APP_HOST='${domains.appHost}' WEBSITE_ALIAS_HOSTS='${domains.websiteAliasHosts.join(", ")}' MEDIA_HOST='${domains.mediaHost}' RUSTFS_ADMIN_HOST='${domains.rustfsAdminHost}' OAUTH2_PROXY_HOST='${domains.oauth2Host}' bash scripts/configure-single-vps-routing.sh`,
      });

      if (githubToken) {
        console.log("Registering GitHub self-hosted runner and enabling local deploy mode...");
        const runnerEnvPath = path.join(generatedDir, "github-runner.env");
        writeShellEnvFile(runnerEnvPath, {
          GITHUB_TOKEN: githubToken,
          GITHUB_REPOSITORY: githubRepository,
          RUNNER_LABELS: "website-deploy,private-network",
          DEPLOY_PATH: "/srv/website/app",
          PROJECT_NAME: "website",
          NONINTERACTIVE: "1",
        });
        installRemoteFile({
          host: websiteHost,
          keyPath,
          localPath: runnerEnvPath,
          remotePath: "/tmp/github-runner.env",
        });
        ssh({
          host: websiteHost,
          keyPath,
          command:
            "set -a && . /tmp/github-runner.env && set +a && rm -f /tmp/github-runner.env && cd /srv/website/app && bash scripts/setup-github-self-hosted-runner.sh",
        });
      }
      console.log(`Single VPS configured: ${websiteHost}`);
    } else {
      console.log("CAId is configured. Storage and website VPSes received AppRole credentials.");
      console.log("Next remote commands:");
      console.log("  cd /srv/website/app && bash scripts/website-stack-vps.sh rustfs   # on storage");
      console.log("  cd /srv/website/app && USE_LOCAL_RUSTFS_NETWORK=false bash scripts/website-stack-vps.sh app   # on website");
    }

    if (githubToken && layout !== "single") {
      console.log("GitHub token was provided, but automatic runner registration is currently implemented for single-VPS layout only.");
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
