import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE_DIR = path.join(process.cwd(), ".local-state");

export function getStateFilePath(envName, filename) {
  return process.env[envName] || path.join(DEFAULT_STATE_DIR, filename);
}

export async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return value;
}
