import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const CONFIG_DIR = process.env.PRINT_WORKER_CONFIG_DIR || "/config";
const CONFIG_FILE =
  process.env.PRINT_WORKER_PRINTER_CONFIG_FILE ||
  path.join(CONFIG_DIR, "caid-print-worker", "printers.json");

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isComplete(config) {
  const printers = Array.isArray(config?.printers) ? config.printers : [];
  const active =
    printers.find((printer) => printer.id === config?.activePrinterId) ||
    printers[0];

  return Boolean(
    active &&
      present(active.host) &&
      present(active.serial) &&
      present(active.accessCode),
  );
}

async function prompt(question, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await globalThis.rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback;
}

function envConfig() {
  if (
    !present(process.env.PRINT_WORKER_PRINTER_HOST) ||
    !present(process.env.PRINT_WORKER_PRINTER_SERIAL) ||
    !present(process.env.PRINT_WORKER_PRINTER_ACCESS_CODE)
  ) {
    return null;
  }

  return {
    activePrinterId: "default",
    printers: [
      {
        id: "default",
        label: process.env.PRINT_WORKER_PRINTER_LABEL || "Default printer",
        host: process.env.PRINT_WORKER_PRINTER_HOST,
        serial: process.env.PRINT_WORKER_PRINTER_SERIAL,
        accessCode: process.env.PRINT_WORKER_PRINTER_ACCESS_CODE,
        lanPort: process.env.PRINT_WORKER_PRINTER_LAN_PORT || "6000",
        ftpPort: process.env.PRINT_WORKER_PRINTER_FTPS_PORT || "990",
        amsSlot: process.env.PRINT_WORKER_AMS_SLOT || "1",
      },
    ],
  };
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

async function promptConfig() {
  globalThis.rl = readline.createInterface({ input, output });
  try {
    const label = await prompt("Printer label", "Default printer");
    const host = await prompt("Printer LAN IP / hostname");
    const serial = await prompt("Printer serial / device id");
    const accessCode = await prompt("Bambu LAN access code");
    const lanPort = await prompt("Bambu LAN MQTT port", "6000");
    const ftpPort = await prompt("Bambu LAN FTPS port", "990");
    const amsSlot = await prompt("AMS slot", "1");

    if (!present(host) || !present(serial) || !present(accessCode)) {
      throw new Error(
        "Printer setup aborted: host, serial, and access code are required.",
      );
    }

    return {
      activePrinterId: "default",
      printers: [
        {
          id: "default",
          label,
          host,
          serial,
          accessCode,
          lanPort,
          ftpPort,
          amsSlot,
        },
      ],
    };
  } finally {
    globalThis.rl.close();
  }
}

async function main() {
  const existing = await readJson(CONFIG_FILE);
  if (isComplete(existing)) {
    console.log(`[printer] loaded printer config from ${CONFIG_FILE}`);
    return;
  }

  const fromEnv = envConfig();
  if (fromEnv) {
    await writeConfig(fromEnv);
    console.log(`[printer] wrote printer config from environment to ${CONFIG_FILE}`);
    return;
  }

  const interactive =
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !process.env.PRINT_WORKER_NONINTERACTIVE;

  if (!interactive) {
    throw new Error(
      `Printer config is missing or incomplete at ${CONFIG_FILE}. Set PRINT_WORKER_PRINTER_HOST, PRINT_WORKER_PRINTER_SERIAL, and PRINT_WORKER_PRINTER_ACCESS_CODE, or run with an interactive TTY.`,
    );
  }

  const config = await promptConfig();
  await writeConfig(config);
  console.log(`[printer] wrote printer config to ${CONFIG_FILE}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
