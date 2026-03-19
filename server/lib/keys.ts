import { storage } from "../storage";

const userApiKeysCache: Record<string, Record<string, string>> = {};

export async function loadUserApiKeys(userId: string): Promise<Record<string, string>> {
  if (userApiKeysCache[userId]) return userApiKeysCache[userId];
  const toggle = await storage.getSystemToggle(`user_keys_${userId}`);
  const keys = (toggle?.parameters as Record<string, string>) || {};
  userApiKeysCache[userId] = keys;
  return keys;
}

export function invalidateUserApiKeyCache(userId: string): void {
  delete userApiKeysCache[userId];
}
