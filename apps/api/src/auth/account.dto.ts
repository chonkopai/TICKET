import {
  ORGANIZER_EVENT_SORTS,
  ORGANIZER_STATUS_GROUPS,
  type AccountOrderStatus,
  type OrganizerEventSort,
  type OrganizerEventStatusGroup,
} from "@event-platform/shared-types";
import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const ORDER_STATUSES: AccountOrderStatus[] = ["pending", "paid", "failed", "cancelled", "refunded"];

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  transactionalTicketDelivery?: boolean;

  @IsOptional()
  @IsBoolean()
  eventReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingAnnouncements?: boolean;
}

export class UpdateOrganizerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/\S/)
  organizationName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9() .-]{3,32}$/)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  showContactInfo?: boolean;
}

export class AccountOrderQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: AccountOrderStatus;
}

export class AccountNotificationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsIn(["true", "false"])
  unreadOnly?: "true" | "false";
}

export class OrganizerWorkspaceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @IsOptional()
  @IsIn(ORGANIZER_STATUS_GROUPS)
  statusGroup?: OrganizerEventStatusGroup = "all";

  @IsOptional()
  @IsIn(ORGANIZER_EVENT_SORTS)
  sort?: OrganizerEventSort = "updated_desc";
}
