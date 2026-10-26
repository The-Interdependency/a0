// 9:17
// === MODULE_BUILD ===
// id: a0_public_auth_user_view
//   module_name: public auth user view
//   module_kind: service
//   summary: Projects an authenticated user onto the minimal browser-visible identity fields.
//   owner: Erin Spencer
//   public_surface: PublicUser, toPublicUser
//   internal_surface: none
//   auth_boundary: read
//   storage_boundary: none
//   network_boundary: none
//   user_data_boundary: read
//   admin_only: false
//   tests: npm run check
//   rollout: default_enabled
//   rollback: Restore route-local user serialization only if it preserves this field allowlist.
// === END MODULE_BUILD ===
import type { User } from "@shared/models/auth";

export type PublicUser = Pick<
  User,
  "id" | "username" | "email" | "displayName" | "role" | "isActive" | "subscriptionTier"
>;

export function toPublicUser(user: User): PublicUser {
  const { id, username, email, displayName, role, isActive, subscriptionTier } = user;
  return { id, username, email, displayName, role, isActive, subscriptionTier };
}
// 9:17
