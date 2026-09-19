import {
  ORGANIZER_EVENT_SORTS,
  ORGANIZER_STATUS_GROUPS,
  type AccountOrderStatus,
  type OrganizerEventSort,
  type OrganizerEventStatusGroup,
} from "@event-platform/shared-types";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

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
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  organizationName!: string;
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
