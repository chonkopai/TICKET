import type { AccountDashboard, AccountNotificationList, AccountOrderList, AuthUser, NotificationPreferences, OrganizerProfile } from "@event-platform/shared-types";
import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CurrentUser, Roles } from "./auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "./auth.guards.js";
import type { AuthenticatedPrincipal } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import { UpdateMeDto } from "./dto.js";
import { AccountNotificationQueryDto, AccountOrderQueryDto, UpdateNotificationPreferencesDto, UpdateOrganizerProfileDto } from "./account.dto.js";
import { AccountService } from "./account.service.js";
import { OrganizerPhotoService } from "./organizer-photo.service.js";
import { MAX_POSTER_BYTES } from "../events/events.constants.js";
import type { UploadedPoster } from "../events/object-storage.js";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountService) private readonly account: AccountService,
    @Inject(OrganizerPhotoService) private readonly organizerPhoto: OrganizerPhotoService,
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

  @Get("notifications")
  notifications(@CurrentUser() principal: AuthenticatedPrincipal, @Query() query: AccountNotificationQueryDto): Promise<AccountNotificationList> {
    return this.account.notifications(principal.userId, query);
  }

  @Patch("notifications/:id/read")
  readNotification(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<{ readAt: string }> {
    return this.account.readNotification(principal.userId, id);
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

  @Post("organizer-profile/photo")
  @Roles("organizer", "admin")
  @UseGuards(RolesGuard)
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: MAX_POSTER_BYTES, files: 1 } }))
  uploadOrganizerPhoto(@CurrentUser() principal: AuthenticatedPrincipal, @UploadedFile() file: UploadedPoster | undefined): Promise<{ photoUrl: string }> {
    return this.organizerPhoto.upload(principal.userId, file);
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
