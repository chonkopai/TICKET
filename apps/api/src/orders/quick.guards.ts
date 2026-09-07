import { timingSafeEqual } from "node:crypto";
import { loadApiEnv } from "@event-platform/config";
import { CanActivate, ExecutionContext, HttpException, Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class QuickRateGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ ip?: string; socket?: { remoteAddress?: string }; method: string }>();
    const now = Date.now();
    for (const [key, value] of this.windows) if (value.until <= now) this.windows.delete(key);
    const key = `${req.ip ?? req.socket?.remoteAddress ?? "unknown"}:${req.method}`;
    const window = this.windows.get(key) ?? { count: 0, until: now + 60000 };
    if (this.windows.size >= 10000 && !this.windows.has(key)) throw new HttpException({ code: "RATE_LIMITED" }, 429);
    this.windows.set(key, window);
    if (++window.count > (req.method === "GET" ? 120 : 30)) throw new HttpException({ code: "RATE_LIMITED" }, 429);
    return true;
  }
}

@Injectable()
export class QuickBotGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const supplied = context.switchToHttp().getRequest().headers["x-bot-api-secret"];
    const expected = Buffer.from(loadApiEnv().BOT_API_SECRET);
    if (typeof supplied !== "string") throw new UnauthorizedException();
    const value = Buffer.from(supplied);
    if (value.length !== expected.length || !timingSafeEqual(value, expected)) throw new UnauthorizedException();
    return true;
  }
}
