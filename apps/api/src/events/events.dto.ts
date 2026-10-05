import { MANAGEMENT_ANALYTICS_BUCKETS, MANAGEMENT_ANALYTICS_MAX_DAYS, MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS, MANAGEMENT_ATTENDANCE_FILTERS, MANAGEMENT_BOOKING_FILTERS, MANAGEMENT_ORDER_PAGE_MAX, MANAGEMENT_ORDER_PAGE_SIZE, MANAGEMENT_PAYMENT_FILTERS, ORGANIZER_EVENT_SORTS, ORGANIZER_STATUS_GROUPS, type ManagementAnalyticsBucket, type ManagementAttendanceFilter, type ManagementBookingFilter, type ManagementPaymentFilter, type OrganizerEventSort, type OrganizerEventStatusGroup } from "@event-platform/shared-types";
import { Type } from "class-transformer";
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const ISO_INSTANT_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

export class EventListQueryDto {
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
  @IsIn(ORGANIZER_STATUS_GROUPS)
  statusGroup?: OrganizerEventStatusGroup = "all";

  @IsOptional()
  @IsIn(ORGANIZER_EVENT_SORTS)
  sort?: OrganizerEventSort = "updated_desc";
}

export class ManagementAnalyticsQueryDto {
  @IsISO8601({ strict: true })
  @Matches(ISO_INSTANT_PATTERN)
  from!: string;

  @IsISO8601({ strict: true })
  @Matches(ISO_INSTANT_PATTERN)
  to!: string;

  @IsIn(MANAGEMENT_ANALYTICS_BUCKETS)
  bucket!: ManagementAnalyticsBucket;
}

export class ManagementOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MANAGEMENT_ORDER_PAGE_MAX)
  limit = MANAGEMENT_ORDER_PAGE_SIZE;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(MANAGEMENT_PAYMENT_FILTERS)
  payment: ManagementPaymentFilter = "all";

  @IsOptional()
  @IsIn(MANAGEMENT_BOOKING_FILTERS)
  booking: ManagementBookingFilter = "all";

  @IsOptional()
  @IsIn(MANAGEMENT_ATTENDANCE_FILTERS)
  attendance: ManagementAttendanceFilter = "all";

  @IsOptional()
  @IsUUID("4")
  tableId?: string;

  @IsOptional()
  @IsUUID("4")
  sectorId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_INSTANT_PATTERN)
  createdFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_INSTANT_PATTERN)
  createdTo?: string;
}

// Kept exported for the later analytics service. Query DTO validation handles
// syntax; Batch 2C enforces these bucket-duration limits using the parsed range.
export const managementAnalyticsLimits = {
  day: MANAGEMENT_ANALYTICS_MAX_DAYS,
  hour: MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS,
} as const;
