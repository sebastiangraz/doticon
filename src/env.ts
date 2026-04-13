/**
 * `dev` state visibility.
 *
 * - Enabled during `vite dev` (localhost).
 * - Disabled in production builds (e.g. Netlify `vite build`), so `dev` is not
 *   listed and `state="dev"` falls back to `dormant`.
 * - Optional override: set `VITE_ENABLE_DEV_DOTICON_STATE=true` in the deploy
 *   environment (e.g. a preview branch) if you need it remotely.
 */
export const isDevStateEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_STATE === "true";
