import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
    process.env[key] ||= value;
  }
}

loadEnvFile(path.join(rootDir, ".env.runtime"));
loadEnvFile(path.join(rootDir, ".env.local"));
loadEnvFile(path.join(rootDir, ".env.full.local.generated"));

const siteResources = JSON.parse(
  fs.readFileSync(path.join(rootDir, "src", "lib", "resource-schema-data.json"), "utf8"),
);

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing S3 config: ${missing.join(", ")}`);
  process.exit(1);
}

const contentTypes = new Map([
  [".svg", "image/svg+xml"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".jfif", "image/jpeg"],
  [".pdf", "application/pdf"],
  [".xml", "application/xml"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
]);

function resolveLocalPath(localPath) {
  if (!localPath) {
    return null;
  }

  if (path.isAbsolute(localPath)) {
    return localPath;
  }

  return path.join(rootDir, localPath);
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

let uploaded = 0;

for (const resource of siteResources) {
  const localPath = resolveLocalPath(resource.localPath);

  if (!localPath || !fs.existsSync(localPath)) {
    console.warn(`Skipping missing resource ${resource.id}: ${localPath || "no localPath"}`);
    continue;
  }

  if (fs.statSync(localPath).isDirectory()) {
    if (!resource.keyPrefix) {
      console.warn(`Skipping directory resource without keyPrefix ${resource.id}: ${localPath}`);
      continue;
    }

    const files = fs.readdirSync(localPath, { withFileTypes: true }).filter((item) => item.isFile());
    for (const file of files) {
      const filePath = path.join(localPath, file.name);
      const extension = path.extname(filePath).toLowerCase();
      const key = `${resource.keyPrefix.replace(/\/+$/, "")}/${file.name}`;
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: fs.createReadStream(filePath),
          ContentType: contentTypes.get(extension) || "application/octet-stream",
        }),
      );
      uploaded += 1;
      console.log(`Uploaded ${resource.id}/${file.name} -> ${process.env.S3_BUCKET}/${key}`);
    }

    continue;
  }

  const extension = path.extname(localPath).toLowerCase();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: resource.key,
      Body: fs.createReadStream(localPath),
      ContentType: contentTypes.get(extension) || "application/octet-stream",
    }),
  );

  uploaded += 1;
  console.log(`Uploaded ${resource.id} -> ${process.env.S3_BUCKET}/${resource.key}`);
}

console.log(`Uploaded ${uploaded} resource(s).`);
