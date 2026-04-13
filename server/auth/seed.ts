// 36:0
import { authStorage } from "./storage";
import { hashPassphrase } from "./password";

export async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminEmail) {
    console.log("[auth] No ADMIN_EMAIL set — skipping admin seed");
    return;
  }

  try {
    const existing = await authStorage.getUserByEmail(adminEmail);

    if (!adminPassword) {
      if (!existing) {
        console.warn("[auth] ADMIN_EMAIL set but ADMIN_PASSWORD not set — cannot seed admin user.");
      }
      return;
    }

    const passphraseHash = await hashPassphrase(adminPassword);

    if (existing) {
      await authStorage.updatePassphrase(existing.id, passphraseHash);
      console.log(`[auth] ✓ Admin passphrase updated — username: ${existing.username}, id: ${existing.id}`);
      return;
    }

    const adminUsername = adminEmail.split("@")[0].replace(/[^a-z0-9]/gi, "_");
    const user = await authStorage.createUser({
      username: adminUsername,
      email: adminEmail,
      passphraseHash,
      displayName: "Admin",
      role: "admin",
    });

    console.log(
      `[auth] ✓ Admin user created — email: ${adminEmail}, username: ${user.username}, id: ${user.id}`
    );
  } catch (err) {
    console.error("[auth] Failed to seed admin user:", err);
  }
}
// 36:0
