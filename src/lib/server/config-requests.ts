import { env } from "@/src/lib/server/env";
import { readOpenBaoKv, writeOpenBaoKv } from "@/src/lib/server/openbao-client";

export type ConfigRequestStatus = "missing" | "provided";

export type ConfigRequest = {
  id: string;
  service: string;
  serviceTitle?: string;
  key: string;
  label: string;
  description?: string;
  secret: boolean;
  required: boolean;
  targetPath: string;
  placeholder?: string;
  status: ConfigRequestStatus;
  createdAt: string;
  updatedAt: string;
};

function isConfigRequest(value: unknown): value is ConfigRequest {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as ConfigRequest).id === "string" &&
    typeof (value as ConfigRequest).key === "string" &&
    typeof (value as ConfigRequest).targetPath === "string"
  );
}

export async function listConfigRequests() {
  const values = await readOpenBaoKv(env.BAO_CONFIG_REQUEST_PATH);

  return Object.values(values)
    .filter(isConfigRequest)
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "missing" ? -1 : 1;
      }

      return left.service.localeCompare(right.service) || left.key.localeCompare(right.key);
    });
}

export async function provideConfigRequestValue(id: string, value: string) {
  const requests = await readOpenBaoKv(env.BAO_CONFIG_REQUEST_PATH);
  const request = requests[id];

  if (!isConfigRequest(request)) {
    throw new Error("Config request not found.");
  }

  const targetValues = await readOpenBaoKv(request.targetPath);
  targetValues[request.key] = value;
  await writeOpenBaoKv(request.targetPath, targetValues);

  requests[id] = {
    ...request,
    status: "provided",
    updatedAt: new Date().toISOString(),
  };
  await writeOpenBaoKv(env.BAO_CONFIG_REQUEST_PATH, requests);

  return requests[id] as ConfigRequest;
}
