import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export interface StudioCommand {
  id: string;
  method: string;
  params: unknown;
  createdAt: number;
}

export interface StudioResult {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface PendingCommand {
  command: StudioCommand;
  sessionId: string;
  resolve: (result: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface StudioSession {
  id: string;
  studioUserId?: number;
  placeId?: number;
  placeName?: string;
  pluginVersion?: string;
  connectedAt: number;
  lastSeenAt: number;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export class StudioBridge {
  readonly host: string;
  readonly port: number;
  private server: ReturnType<typeof createServer> | undefined;
  private readonly sessions = new Map<string, StudioSession>();
  private readonly queues = new Map<string, StudioCommand[]>();
  private readonly pending = new Map<string, PendingCommand>();
  private preferredSessionId: string | undefined;

  constructor(host = "127.0.0.1", port = 34718) {
    this.host = host;
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => {
      void this.route(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, this.host, () => resolve());
    });
  }

  async stop(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Studio bridge stopped."));
    }
    this.pending.clear();
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = undefined;
  }

  getStatus(): {
    connected: boolean;
    session?: StudioSession;
    sessions: StudioSession[];
    queuedCommands: number;
  } {
    const sessions = this.activeSessions();
    const preferred = this.preferredSession(sessions);
    return {
      connected: Boolean(preferred),
      ...(preferred ? { session: preferred } : {}),
      sessions,
      queuedCommands: [...this.queues.values()].reduce((sum, queue) => sum + queue.length, 0),
    };
  }

  execute(method: string, params: unknown, timeoutMs = 30_000): Promise<unknown> {
    const session = this.preferredSession(this.activeSessions());
    if (!session) {
      return Promise.reject(
        new Error("Roblox Studio is not connected. Open Studio and enable the Motion Director plugin."),
      );
    }

    return this.executeForSession(session, method, params, timeoutMs);
  }

  async executeAny(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
    const sessions = this.activeSessions();
    if (sessions.length === 0) {
      throw new Error(
        "Roblox Studio is not connected. Open Studio and enable the Motion Director plugin.",
      );
    }
    const settled = await Promise.allSettled(
      sessions.map(async (session) => ({
        sessionId: session.id,
        result: await this.executeForSession(session, method, params, timeoutMs),
      })),
    );
    const successes = settled.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value] : [],
    );
    if (successes.length === 0) {
      throw new Error(`No connected Studio session supports command ${method}.`);
    }

    // Capability discovery is also session selection. When duplicate local
    // plugin packages are active, pin the most capable baker deterministically.
    const winner =
      method === "system.capabilities"
        ? successes.reduce((best, candidate) => {
            const versionOf = (value: unknown) => {
              if (!value || typeof value !== "object") return { analyzer: 0, baker: 0 };
              const capabilities = value as {
                animationAnalyzerVersion?: unknown;
                parentSpaceBakerVersion?: unknown;
              };
              return {
                analyzer: Number(capabilities.animationAnalyzerVersion ?? 0),
                baker: Number(capabilities.parentSpaceBakerVersion ?? 0),
              };
            };
            const isRunning = (value: unknown) =>
              Boolean(
                value &&
                  typeof value === "object" &&
                  "isRunning" in value &&
                  (value as { isRunning?: unknown }).isRunning,
              );
            const candidateVersion = versionOf(candidate.result);
            const bestVersion = versionOf(best.result);
            if (candidateVersion.analyzer !== bestVersion.analyzer) {
              return candidateVersion.analyzer > bestVersion.analyzer ? candidate : best;
            }
            if (candidateVersion.baker !== bestVersion.baker) {
              return candidateVersion.baker > bestVersion.baker ? candidate : best;
            }
            return isRunning(candidate.result) && !isRunning(best.result) ? candidate : best;
          })
        : successes[0]!;
    this.preferredSessionId = winner.sessionId;
    return winner.result;
  }

  private executeForSession(
    session: StudioSession,
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const command: StudioCommand = {
      id: randomUUID(),
      method,
      params,
      createdAt: Date.now(),
    };
    const queue = this.queues.get(session.id) ?? [];
    queue.push(command);
    this.queues.set(session.id, queue);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(command.id);
        reject(new Error(`Studio command ${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(command.id, { command, sessionId: session.id, resolve, reject, timeout });
    });
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.applySecurityHeaders(response);
    if (!this.isSafeLocalRequest(request)) {
      this.json(response, 403, { error: "Local plugin requests only." });
      return;
    }

    try {
      if (request.method === "GET" && request.url === "/health") {
        this.json(response, 200, { ok: true, service: "roblox-motion-director" });
        return;
      }

      if (request.method === "GET" && request.url === "/status") {
        this.json(response, 200, this.getStatus());
        return;
      }

      if (request.method === "POST" && request.url === "/plugin/connect") {
        const body = await this.readJson(request);
        const studioUserId = this.optionalNumber(body.studioUserId);
        const placeId = this.optionalNumber(body.placeId);
        const placeName = this.optionalString(body.placeName);
        const pluginVersion = this.optionalString(body.pluginVersion);
        const session: StudioSession = {
          id: randomUUID(),
          ...(studioUserId === undefined ? {} : { studioUserId }),
          ...(placeId === undefined ? {} : { placeId }),
          ...(placeName === undefined ? {} : { placeName }),
          ...(pluginVersion === undefined ? {} : { pluginVersion }),
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        };
        this.sessions.set(session.id, session);
        this.queues.set(session.id, []);
        this.json(response, 200, { sessionId: session.id, pollIntervalMs: 350 });
        return;
      }

      if (request.method === "POST" && request.url === "/plugin/poll") {
        const body = await this.readJson(request);
        const session = this.acceptSession(body.sessionId);
        if (!session) {
          this.json(response, 409, { reconnect: true });
          return;
        }
        session.lastSeenAt = Date.now();
        const queue = this.queues.get(session.id) ?? [];
        this.json(response, 200, { command: queue.shift() ?? null });
        return;
      }

      if (request.method === "POST" && request.url === "/plugin/result") {
        const body = (await this.readJson(request)) as unknown as StudioResult & {
          sessionId?: unknown;
        };
        const session = this.acceptSession(body.sessionId);
        if (!session) {
          this.json(response, 409, { reconnect: true });
          return;
        }
        const pending = this.pending.get(body.id);
        if (!pending) {
          this.json(response, 404, { error: "Unknown or expired command." });
          return;
        }
        if (pending.sessionId !== session.id) {
          this.json(response, 409, { error: "Command belongs to a different Studio session." });
          return;
        }
        clearTimeout(pending.timeout);
        this.pending.delete(body.id);
        if (body.ok) {
          pending.resolve(body.result);
        } else {
          pending.reject(new Error(body.error?.message ?? "Studio command failed."));
        }
        this.json(response, 200, { accepted: true });
        return;
      }

      this.json(response, 404, { error: "Not found." });
    } catch (error) {
      this.json(response, 400, {
        error: error instanceof Error ? error.message : "Invalid request.",
      });
    }
  }

  private isSafeLocalRequest(request: IncomingMessage): boolean {
    if (request.headers.origin) return false;
    if (request.headers["x-roblox-motion-bridge"] !== "1") return false;
    const host = request.headers.host?.split(":")[0] ?? "";
    return LOOPBACK_HOSTS.has(host);
  }

  private acceptSession(value: unknown): StudioSession | undefined {
    return typeof value === "string" ? this.sessions.get(value) : undefined;
  }

  private activeSessions(): StudioSession[] {
    const now = Date.now();
    return [...this.sessions.values()]
      .filter((session) => now - session.lastSeenAt < 10_000)
      .sort((left, right) => right.connectedAt - left.connectedAt);
  }

  private preferredSession(sessions: StudioSession[]): StudioSession | undefined {
    return (
      sessions.find((session) => session.id === this.preferredSessionId) ??
      sessions.find((session) =>
        session.placeName?.toLowerCase().includes("motiondirectortestplace"),
      ) ?? sessions[0]
    );
  }

  private async readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 4 * 1024 * 1024) throw new Error("Request exceeds 4 MiB.");
      chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object.");
    }
    return parsed as Record<string, unknown>;
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
  }

  private applySecurityHeaders(response: ServerResponse): void {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Access-Control-Allow-Origin", "null.invalid");
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }
}
