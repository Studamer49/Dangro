import { DurableObject } from "cloudflare:workers";

/**
 * Cloudflare Workers entry point.
 *
 * Dangro is an Express + Socket.IO server, not a Workers-native app: it keeps
 * live socket state in memory, writes uploads to GridFS, opens plain TCP to
 * MongoDB and speaks SMTP. None of that runs inside a Worker isolate, so the
 * server runs in a Cloudflare Container and this Worker is only the front
 * door:
 *
 *   browser ──▶ Worker ──┬─▶ static assets (client/dist) at the edge
 *                        └─▶ DangroBackend container (API, uploads, sockets)
 *
 * Both live on the same hostname, so cookies, CORS, Socket.IO and stored
 * media URLs stay same-origin exactly as they did on the single-host deploy.
 */

interface Env {
  ASSETS: Fetcher;
  BACKEND: DurableObjectNamespace<DangroBackend>;
  /** Worker vars and secrets. Only the keys listed below reach the container. */
  [key: string]: unknown;
}

/** Paths that belong to the Express server rather than the static assets. */
const BACKEND_PREFIXES = ["/api", "/uploads", "/socket.io"];

/** The container's port. Mirrors `vars.PORT` and the Dockerfile's EXPOSE. */
const CONTAINER_PORT = 8080;

/** Readiness probe. `/api/health` does not touch the database. */
const HEALTH_PATH = "/api/health";

/**
 * How long the container may sit idle before Cloudflare stops it.
 *
 * Longer than the default ten minutes because a chat app with an open tab is
 * worth keeping warm — a cold start is 1-3 seconds and happens on the first
 * message after a quiet spell. It is not "always on": with no traffic at all
 * the instance still stops and stops costing money.
 */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

/** A cold start includes MongoDB connect + index creation, so allow a minute. */
const READY_TIMEOUT_MS = 60_000;

/** Gap between readiness probes. */
const READINESS_POLL_MS = 250;

/**
 * Environment variables copied from the Worker into the container.
 *
 * Deliberately an allow-list rather than "everything in env": Worker
 * bindings such as ASSETS and BACKEND are objects, and handing the container
 * `[object Object]` for those would be worse than omitting them.
 *
 * Secrets are set with `wrangler secret put <NAME>` and arrive here exactly
 * like vars do. Anything unset is simply not passed, which lets the server
 * apply its own defaults and report what is missing at boot.
 */
const CONTAINER_ENV_KEYS = [
  // Runtime
  "NODE_ENV",
  "PORT",
  // Database
  "DATABASE_PROVIDER",
  "DATABASE_URL",
  "MONGODB_URI",
  "MONGODB_DB_NAME",
  // Media
  "MEDIA_PROVIDER",
  "MEDIA_PUBLIC_URL",
  "MEDIA_INGEST_URL",
  "MEDIA_INGEST_KEY",
  "UPLOAD_DIR",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_URL",
  "CLOUDINARY_IMAGE_MAX_BYTES",
  "CLOUDINARY_FOLDER",
  "CLOUDINARY_TIMEOUT_MS",
  // Calls
  "TURN_URLS",
  "TURN_SECRET",
  "TURN_USERNAME",
  "TURN_CREDENTIAL",
  "TURN_TTL_SECONDS",
  "STUN_URLS",
  // Auth
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "CLIENT_URL",
  "APP_BASE_URL",
  // Email
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "EMAIL_TRANSPORT",
  "EMAIL_TIMEOUT_MS",
  "EMAIL_VERIFICATION_TOKEN_TTL_MINUTES",
  "PASSWORD_RESET_TOKEN_TTL_MINUTES",
  "EMAIL_VERIFY_RATE_LIMIT",
  "EMAIL_RESEND_RATE_LIMIT",
] as const;

export class DangroBackend extends DurableObject<Env> {
  /** Shared across concurrent requests so a cold start is only paid once. */
  private starting: Promise<void> | undefined;

  /**
   * The public origin of the first request this instance saw.
   *
   * The container's environment is fixed when it starts, and the app needs its
   * public origin for email links (`APP_BASE_URL`) and the CORS allow-list
   * (`CLIENT_URL`). Rather than make every deployer hand-edit a placeholder,
   * take it from the request that wakes the container. Preview URLs are not
   * generated for Workers that implement Durable Objects, so in production
   * this is always the real hostname.
   */
  private publicOrigin: string | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS)
      );
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.publicOrigin ??= new URL(request.url).origin;

    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const container = this.ctx.container;
    if (!container) {
      throw new Error("Containers are not available in this environment");
    }

    const original = new URL(request.url);
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";

    // Passing the original request keeps the body, method and — crucially —
    // the `Upgrade: websocket` header Socket.IO needs. Returning the port
    // response untouched preserves the 101 handshake.
    const forwarded = new Request(url, request);

    forwarded.headers.delete("host");

    // Express runs with `trust proxy = 1`, so it reads the client address from
    // the last X-Forwarded-For entry. Without this every request would look
    // like it came from one address and every per-IP rate limit would be a
    // single shared bucket for the whole site.
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) forwarded.headers.set("x-forwarded-for", clientIp);

    // The container only speaks plain HTTP on its private port; tell Express
    // the original request arrived over TLS so secure cookies and HSTS behave
    // as they did behind any other reverse proxy.
    forwarded.headers.set("x-forwarded-proto", "https");
    forwarded.headers.set("x-forwarded-host", original.host);

    return container.getTcpPort(CONTAINER_PORT).fetch(forwarded);
  }

  private async startAndWaitForPort(): Promise<void> {
    const container = this.ctx.container;
    if (!container) {
      throw new Error("Containers are not available in this environment");
    }

    if (!container.running) {
      container.start({
        image: container.images.base,
        // 256 MiB ("lite") is not enough for Node + the Mongo driver +
        // bcrypt + the Prisma shim. 1 GiB with 1/4 vCPU is the smallest
        // size this server actually fits in.
        instance: "basic",
        // MongoDB Atlas, SMTP and Cloudinary are all off-platform, so the
        // container must be allowed outbound connections.
        enableInternet: true,
        env: this.containerEnv(),
      });
    }

    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    const port = container.getTcpPort(CONTAINER_PORT);
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastError: unknown;

    while (Date.now() < deadline) {
      try {
        const response = await port.fetch(`http://container${HEALTH_PATH}`, {
          signal: AbortSignal.timeout(2000),
        });
        // The probe result is not needed; drain it so the connection closes.
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error(`Health check returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(READINESS_POLL_MS);
    }

    throw new Error(
      `Dangro's container did not become ready within ${READY_TIMEOUT_MS / 1000}s`,
      { cause: lastError }
    );
  }

  /** The allow-listed Worker vars and secrets, as container env. */
  private containerEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    const source = this.env as Record<string, unknown>;

    for (const key of CONTAINER_ENV_KEYS) {
      const value = source[key];
      if (typeof value === "string" && value.length > 0) {
        env[key] = value;
      }
    }

    // Fall back to the origin this Worker is served from. An explicit
    // APP_BASE_URL / CLIENT_URL in wrangler.jsonc always wins, which is what
    // you want when several hostnames point at the same Worker.
    if (this.publicOrigin) {
      env.APP_BASE_URL ??= this.publicOrigin;
      env.CLIENT_URL ??= this.publicOrigin;
    }

    return env;
  }
}

function isBackendPath(pathname: string): boolean {
  return BACKEND_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (isBackendPath(pathname)) {
      // One instance, by design. The server keeps Socket.IO rooms, presence,
      // rate-limit counters and call state in process memory; spreading
      // requests over a pool would split every one of those.
      return env.BACKEND.getByName("main").fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
