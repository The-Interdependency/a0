import bcrypt from "bcryptjs";

const ROUNDS = 12;

export const PASSPHRASE_MIN_LENGTH = 16;

export function validatePassphrase(passphrase: string): { valid: boolean; error?: string } {
  if (!passphrase || passphrase.length < PASSPHRASE_MIN_LENGTH) {
    return {
      valid: false,
      error: `Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters. Try a full sentence like "The blue lighthouse blinks at midnight".`,
    };
  }
  return { valid: true };
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  return bcrypt.hash(passphrase, ROUNDS);
}

export async function verifyPassphrase(passphrase: string, hash: string): Promise<boolean> {
  return bcrypt.compare(passphrase, hash);
}
