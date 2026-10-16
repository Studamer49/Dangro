/**
 * A window event the server rail fires when Home is pressed while the feed is
 * already on screen.
 *
 * That click used to run `window.location.reload()`, which rebuilt the entire
 * app — every always-animating avatar in the rail and header visibly reloaded
 * with it. Broadcasting instead lets the feed refetch its own data in place, so
 * whatever was already playing keeps playing.
 */
export const FEED_REFRESH_EVENT = "dangro:feed-refresh";

export function requestFeedRefresh(): void {
  window.dispatchEvent(new Event(FEED_REFRESH_EVENT));
}
