import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { StaffRole } from "@event-platform/shared-types";
import {
  StaffAuthService,
  secureEqual,
  staffCookie,
} from "./staff-auth.service.js";
import {
  STAFF_CONFIG,
  enabled,
  type StaffConfig,
  type StaffPrincipal,
} from "./staff.config.js";
export interface StaffRequest {
  headers: Record<string, string | undefined>;
  method: string;
  staff: StaffPrincipal;
}
export const StaffRoles = (...roles: StaffRole[]) =>
  SetMetadata("staff:roles", roles);
export function cookieToken(
  req: Pick<StaffRequest, "headers">,
  config: StaffConfig,
) {
  const entry = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${staffCookie(config)}=`));
  try {
    return entry
      ? decodeURIComponent(entry.slice(entry.indexOf("=") + 1))
      : undefined;
  } catch {
    return undefined;
  }
}
@Injectable()
export class StaffGatewayGuard implements CanActivate {
  constructor(@Inject(STAFF_CONFIG) private config: StaffConfig) {}
  canActivate(context: ExecutionContext) {
    enabled(this.config);
    const req = context.switchToHttp().getRequest<StaffRequest>();
    if (
      !secureEqual(
        req.headers["x-staff-gateway"] ?? "",
        this.config.gatewaySecret,
      ) ||
      req.headers["x-staff-origin"] !== this.config.origin
    )
      throw new ForbiddenException({ code: "STAFF_HOST_REQUIRED" });
    context
      .switchToHttp()
      .getResponse<{ setHeader(k: string, v: string): void }>()
      .setHeader("Cache-Control", "no-store");
    return true;
  }
}
@Injectable()
export class StaffPendingGuard implements CanActivate {
  constructor(@Inject(StaffAuthService) private auth: StaffAuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<StaffRequest>();
    req.staff = await this.auth.authenticate(
      cookieToken(req, this.auth.config),
      req.headers["x-staff-csrf"],
      !["GET", "HEAD"].includes(req.method),
      true,
    );
    return true;
  }
}
@Injectable()
export class StaffSessionGuard implements CanActivate {
  constructor(
    @Inject(StaffAuthService) private auth: StaffAuthService,
    @Inject(Reflector) private reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<StaffRequest>();
    req.staff = await this.auth.authenticate(
      cookieToken(req, this.auth.config),
      req.headers["x-staff-csrf"],
      !["GET", "HEAD"].includes(req.method),
    );
    const roles = this.reflector.getAllAndOverride<StaffRole[]>("staff:roles", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(req.staff.role))
      throw new ForbiddenException({ code: "MODERATOR_REQUIRED" });
    return true;
  }
}
