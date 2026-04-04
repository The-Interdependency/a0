export function isUnauthorizedError(error: Error): boolean {
  return /^401:/.test(error.message);
}

export function redirectToLogin() {
  window.location.href = "/login";
}
