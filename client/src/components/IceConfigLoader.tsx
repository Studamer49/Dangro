import { useEffect } from "react";
import api from "@/lib/api";
import { applyIceServers } from "@/lib/iceServers";

/**
 * Loads the deployment's ICE configuration once per session.
 *
 * Mounted near the root so it is in flight long before the first call, and a
 * failure is deliberately silent: the bundled fallback list is already usable,
 * so a failed fetch costs this deployment its own relay, not its calls.
 *
 * A call placed before the fetch resolves uses the fallback and is unaffected.
 */
export default function IceConfigLoader() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await api.get("/rtc/ice-servers");
        if (!cancelled) applyIceServers(data);
      } catch {
        // Keep the bundled defaults.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}