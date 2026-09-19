import type { AccountDashboard, AccountOrderList, AuthUser, NotificationPreferences, OrganizerProfile } from "@event-platform/shared-types";
import { Body, Controller, Get, Inject, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser, Roles } from "./auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "./auth.guards.js";
import type { AuthenticatedPrincipal } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import { UpdateMeDto } from "./dto.js";
import { AccountOrderQueryDto, UpdateNotificationPreferencesDto, UpdateOrganizerProfileDto } from "./account.dto.js";
import { AccountService } from "./account.service.js";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountService) private readonly account: AccountService,
  ) {}

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

  @Get("dashboard")
  dashboard(@CurrentUser() principal: AuthenticatedPrincipal): Promise<AccountDashboard> {
    return this.account.dashboard(principal.userId);
  }

  @Get("orders")
  orders(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AccountOrderQueryDto,
  ): Promise<AccountOrderList> {
    return this.account.orders(principal.userId, query);
  }

  @Get("notification-preferences")
  preferences(@CurrentUser() principal: AuthenticatedPrincipal): Promise<NotificationPreferences> {
    return this.account.preferences(principal.userId);
  }

  @Patch("notification-preferences")
  updatePreferences(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() body: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.account.updatePreferences(principal.userId, body);
  }

  @Get("organizer-profile")
  @Roles("organizer", "admin")
  @UseGuards(RolesGuard)
  async organizerProfile(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OrganizerProfile> {
    const user = await this.auth.getMe(principal.userId);
    return this.account.organizerProfile(principal.userId, user.name);
  }

  @Patch("organizer-profile")
  @Roles("organizer", "admin")
  @UseGuards(RolesGuard)
  updateOrganizerProfile(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() body: UpdateOrganizerProfileDto,
  ): Promise<OrganizerProfile> {
    return this.account.updateOrganizerProfile(principal.userId, body);
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
