import { resourceUrlFromKey } from "@/src/lib/resource-schema";

export function mediaUrl(key: string) {
  return resourceUrlFromKey(key);
}
