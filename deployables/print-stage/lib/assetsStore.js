import fs from "node:fs/promises";
import path from "node:path";

import { createInitialAssetState, migrateAssetState } from "./assetsDomain.js";

const DEFAULT_ASSET_STORE_PATH = path.join(process.cwd(), ".local-state", "assets.json");

export function getAssetStorePath() {
  return process.env.ASSET_STORE_PATH || DEFAULT_ASSET_STORE_PATH;
}

export async function readAssetState() {
  try {
    const text = await fs.readFile(getAssetStorePath(), "utf8");
    return migrateAssetState(JSON.parse(text));
  } catch {
    return createInitialAssetState();
  }
}

export async function writeAssetState(state) {
  const target = getAssetStorePath();
  const next = migrateAssetState(state);
  next.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

export async function updateAssetState(mutator) {
  const current = await readAssetState();
  const result = await mutator(current);
  const nextState = result?.state || current;
  const saved = await writeAssetState(nextState);
  return { ...result, state: saved };
}
