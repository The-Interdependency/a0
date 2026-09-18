// 37:0 0:0 0:2
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
    if (existing) {
      if (existing.role !== "admin") {
        throw new Error("ADMIN_EMAIL belongs to a non-admin account; verify ownership and select a fresh bootstrap identity");
      }
      return;
    }

    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD is required to bootstrap ADMIN_EMAIL");
    }

    const passphraseHash = await hashPassphrase(adminPassword);
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
    throw err;
  }
}
// 37:0 0:0 0:2
