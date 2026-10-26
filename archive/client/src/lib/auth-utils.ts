// 6:0 0:2 0:0
export function isUnauthorizedError(error: Error): boolean {
  return /^401:/.test(error.message);
}

export function redirectToLogin() {
  window.location.href = "/login";
}
// 6:0 0:2 0:0
