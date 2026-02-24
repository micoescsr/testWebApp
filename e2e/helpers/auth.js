// e2e/helpers/auth.js
// Shared Playwright helper: log in and return an authenticated page.

/**
 * Log in to the app with the given credentials.
 * Assumes the login form at /login has email + password inputs + a "Login now" button.
 * Returns after the page navigates to /dashboard.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} email
 * @param {string} password
 */
export async function login(page, email, password) {
  await page.goto("/login");
  await page.getByPlaceholder("Enter your email").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /login now/i }).click();
  // Wait for redirect to dashboard (or timeout)
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}
