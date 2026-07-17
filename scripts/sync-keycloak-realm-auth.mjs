import fs from "node:fs";

function parseArgs(argv) {
  const result = { envFiles: [] };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") {
      result.envFiles.push(argv[++index]);
    }
  }

  return result;
}

function parseEnvFile(filePath) {
  const values = {};
  if (!filePath || !fs.existsSync(filePath)) return values;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index === -1) continue;

    let value = line.slice(index + 1);
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[line.slice(0, index)] = value;
  }

  return values;
}

function mergeEnv(envFiles) {
  return envFiles.reduce(
    (merged, filePath) => ({
      ...merged,
      ...parseEnvFile(filePath),
    }),
    { ...process.env },
  );
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getRealmFromIssuer(issuer) {
  const issuerUrl = new URL(issuer);
  const parts = issuerUrl.pathname.split("/").filter(Boolean);
  const realm = parts[parts.length - 1];

  if (!realm) {
    throw new Error("Unable to determine Keycloak realm from KEYCLOAK_ISSUER.");
  }

  return { origin: issuerUrl.origin, realm };
}

async function keycloakJson(url, options = {}) {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let body = {};

  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { raw: bodyText.slice(0, 300) };
    }
  }

  if (!response.ok) {
    throw new Error(
      `Keycloak ${options.method || "GET"} ${url} failed (${response.status}): ${JSON.stringify(body).slice(0, 700)}`,
    );
  }

  return body;
}

async function getAdminToken(env, origin) {
  const adminRealm = env.KEYCLOAK_ADMIN_REALM || "master";
  const adminClientId = env.KEYCLOAK_ADMIN_CLIENT_ID || "admin-cli";
  const params = new URLSearchParams();

  if (env.KEYCLOAK_ADMIN_CLIENT_SECRET) {
    params.set("grant_type", "client_credentials");
    params.set("client_id", adminClientId);
    params.set("client_secret", env.KEYCLOAK_ADMIN_CLIENT_SECRET);
  } else if (env.KEYCLOAK_ADMIN_USERNAME && env.KEYCLOAK_ADMIN_PASSWORD) {
    params.set("grant_type", "password");
    params.set("client_id", adminClientId);
    params.set("username", env.KEYCLOAK_ADMIN_USERNAME);
    params.set("password", env.KEYCLOAK_ADMIN_PASSWORD);
  } else {
    throw new Error("KEYCLOAK_ADMIN_CLIENT_SECRET or KEYCLOAK_ADMIN_USERNAME/PASSWORD is required.");
  }

  const tokenPayload = await keycloakJson(
    `${origin}/realms/${adminRealm}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    },
  );

  return required(tokenPayload.access_token, "Keycloak admin access token");
}

async function syncGoogleIdentityProvider(env, origin, realm, token) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.log("Keycloak Google identity provider skipped: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are missing.");
    return { configured: false, skipped: true };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const providers = await keycloakJson(`${origin}/admin/realms/${realm}/identity-provider/instances`, {
    headers,
  });
  const existing = Array.isArray(providers) && providers.some((provider) => provider.alias === "google");
  const representation = {
    alias: "google",
    displayName: "Google",
    providerId: "google",
    enabled: true,
    trustEmail: true,
    storeToken: false,
    addReadTokenRoleOnCreate: false,
    authenticateByDefault: false,
    linkOnly: false,
    config: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      defaultScope: "openid profile email",
      syncMode: "IMPORT",
      useJwksUrl: "true",
      hideOnLoginPage: "false",
    },
  };

  if (existing) {
    await keycloakJson(`${origin}/admin/realms/${realm}/identity-provider/instances/google`, {
      method: "PUT",
      headers,
      body: JSON.stringify(representation),
    });
  } else {
    await keycloakJson(`${origin}/admin/realms/${realm}/identity-provider/instances`, {
      method: "POST",
      headers,
      body: JSON.stringify(representation),
    });
  }

  return {
    configured: true,
    redirectUri: `${origin}/realms/${realm}/broker/google/endpoint`,
  };
}

function envFlag(value, defaultValue = "false") {
  return String(value ?? defaultValue).toLowerCase() === "true" ? "true" : "false";
}

function pick(env, ...keys) {
  for (const key of keys) {
    if (env[key]) return env[key];
  }

  return "";
}

function getSmtpConfig(env) {
  const host = pick(env, "KEYCLOAK_SMTP_HOST", "SMTP_HOST");
  const from = pick(env, "KEYCLOAK_SMTP_FROM", "SMTP_FROM", "MAIL_FROM", "EMAIL_FROM");

  if (!host || !from) return null;

  const smtp = {
    host,
    from,
    port: pick(env, "KEYCLOAK_SMTP_PORT", "SMTP_PORT") || "587",
    ssl: envFlag(pick(env, "KEYCLOAK_SMTP_SSL", "SMTP_SSL")),
    starttls: envFlag(pick(env, "KEYCLOAK_SMTP_STARTTLS", "SMTP_STARTTLS"), "true"),
    auth: envFlag(pick(env, "KEYCLOAK_SMTP_AUTH", "SMTP_AUTH"), pick(env, "KEYCLOAK_SMTP_USER", "SMTP_USER") ? "true" : "false"),
  };

  const fromDisplayName = pick(env, "KEYCLOAK_SMTP_FROM_DISPLAY_NAME", "SMTP_FROM_DISPLAY_NAME");
  const replyTo = pick(env, "KEYCLOAK_SMTP_REPLY_TO", "SMTP_REPLY_TO");
  const replyToDisplayName = pick(env, "KEYCLOAK_SMTP_REPLY_TO_DISPLAY_NAME", "SMTP_REPLY_TO_DISPLAY_NAME");
  const user = pick(env, "KEYCLOAK_SMTP_USER", "SMTP_USER");
  const password = pick(env, "KEYCLOAK_SMTP_PASSWORD", "SMTP_PASSWORD");

  if (fromDisplayName) smtp.fromDisplayName = fromDisplayName;
  if (replyTo) smtp.replyTo = replyTo;
  if (replyToDisplayName) smtp.replyToDisplayName = replyToDisplayName;
  if (user) smtp.user = user;
  if (password) smtp.password = password;

  return smtp;
}

async function syncSmtp(env, origin, realm, token) {
  const smtp = getSmtpConfig(env);

  if (!smtp) {
    console.log("Keycloak SMTP skipped: set KEYCLOAK_SMTP_HOST and KEYCLOAK_SMTP_FROM to enable password recovery emails.");
    return { configured: false, skipped: true };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const realmConfig = await keycloakJson(`${origin}/admin/realms/${realm}`, { headers });

  await keycloakJson(`${origin}/admin/realms/${realm}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      ...realmConfig,
      smtpServer: smtp,
    }),
  });

  return {
    configured: true,
    hostPresent: Boolean(smtp.host),
    fromPresent: Boolean(smtp.from),
    userPresent: Boolean(smtp.user),
    passwordPresent: Boolean(smtp.password),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = mergeEnv(args.envFiles);
  const issuer = required(env.KEYCLOAK_ISSUER, "KEYCLOAK_ISSUER");
  const { origin, realm } = getRealmFromIssuer(issuer);
  const token = await getAdminToken(env, origin);
  const google = await syncGoogleIdentityProvider(env, origin, realm, token);
  const smtp = await syncSmtp(env, origin, realm, token);

  console.log(
    JSON.stringify(
      {
        keycloakRealm: realm,
        google,
        smtp,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
