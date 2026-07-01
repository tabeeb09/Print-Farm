import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const nodeModulesDir = path.join(rootDir, "node_modules");
const sentinelPackages = [
  "@aws-sdk/client-s3",
  "mqtt",
  "next",
];

function hasDependency(pkgName) {
  return fs.existsSync(path.join(nodeModulesDir, pkgName, "package.json"));
}

function main() {
  const missing = sentinelPackages.filter((pkgName) => !hasDependency(pkgName));

  if (!missing.length) {
    return;
  }

  console.log(`[print-stage] installing worker dependencies: ${missing.join(", ")}`);
  execFileSync("npm", ["install"], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true,
  });
}

main();
