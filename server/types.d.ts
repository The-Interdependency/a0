// 13:0
import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userEmail?: string;
    userRole?: string;
    pendingResetUserId?: string;
    resetVerifiedUserId?: string;
    resetToken?: string;
    resetTokenHash?: string;
    resetTokenExpiry?: number;
  }
}

export {};
// 13:0
