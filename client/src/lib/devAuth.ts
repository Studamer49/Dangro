import type { User } from "@/types";

/**
 * Local-only development session.
 *
 * With no backend running, `GET /auth/me` can never succeed, so the app would
 * sit on the login screen forever. In a Vite dev build (`import.meta.env.DEV`)
 * we substitute a fake signed-in user so the interface can be developed and
 * reviewed without a database.
 *
 * This is compiled out of production: `import.meta.env.DEV` is `false` after
 * `vite build`, so `devAuthEnabled` is `false` there and the real login and
 * signup flow is completely untouched.
 *
 * To use a real local backend instead of the bypass, set
 * `VITE_DEV_BYPASS_AUTH=false` in `client/.env`.
 */
export const devAuthEnabled =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH !== "false";

export const devUser: User = {
  id: "dev-local-user",
  username: "dev",
  email: "dev@localhost",
  bio: "Local development session (backend bypassed)",
  avatar: null,
  status: "online",
  lastSeen: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
