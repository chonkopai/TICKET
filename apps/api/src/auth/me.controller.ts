import type { AuthUser } from "@event-platform/shared-types";
import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser, Roles } from "./auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "./auth.guards.js";
import type { AuthenticatedPrincipal } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import { UpdateMeDto } from "./dto.js";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  getMe(@CurrentUser() principal: AuthenticatedPrincipal): Promise<AuthUser> {
    return this.auth.getMe(principal.userId);
  }

  @Patch()
  updateMe(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() body: UpdateMeDto,
  ): Promise<AuthUser> {
    return this.auth.updateMe(principal.userId, body);
  }

  @Post("become-organizer")
  becomeOrganizer(@CurrentUser() principal: AuthenticatedPrincipal): Promise<AuthUser> {
    return this.auth.becomeOrganizer(principal.userId);
  }

  @Get("organizer-access")
  @Roles("organizer", "admin")
  @UseGuards(RolesGuard)
  organizerAccess(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): { allowed: true; role: AuthenticatedPrincipal["role"] } {
    return { allowed: true, role: principal.role };
  }
}
