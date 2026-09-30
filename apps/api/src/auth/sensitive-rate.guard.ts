import { CanActivate, type ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "./auth.constants.js";

type Request = { ip?: string; socket?: { remoteAddress?: string }; method?: string; path?: string; user?: AuthenticatedPrincipal };
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;

/** A bounded per-process brake on expensive or sensitive actions. The DB still
 * enforces uniqueness and authorization; distributed edge limits are a deploy gate. */
@Injectable()
export class SensitiveRateGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number; until: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    for (const [key, value] of this.windows) if (value.until <= now) this.windows.delete(key);
    const path = (request.path ?? "unknown").replace(UUID_SEGMENT, "/:id");
    const actor = request.user?.userId ? `user:${request.user.userId}` : `ip:${request.ip ?? request.socket?.remoteAddress ?? "unknown"}`;
    const key = `${actor}:${request.method ?? "POST"}:${path}`;
    if (this.windows.size >= 10_000 && !this.windows.has(key)) throw new HttpException({ code: "RATE_LIMITED" }, 429);
    const window = this.windows.get(key) ?? { count: 0, until: now + 60_000 };
    this.windows.set(key, window);
    const limit = path.includes("telegram/widget") ? 10 : path.includes("refresh") ? 60 : path.includes("/use") || path.includes("/inspect") ? 120 : 30;
    if (++window.count > limit) throw new HttpException({ code: "RATE_LIMITED" }, 429);
    return true;
  }
}
