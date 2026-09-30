import { COUNTRY_CODES, EVENT_AGE_RESTRICTIONS, EVENT_CATEGORIES, EVENT_LOCALES, MANAGEMENT_ANALYTICS_BUCKETS, MANAGEMENT_ANALYTICS_MAX_DAYS, MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS, MANAGEMENT_ATTENDANCE_FILTERS, MANAGEMENT_BOOKING_FILTERS, MANAGEMENT_ORDER_PAGE_MAX, MANAGEMENT_ORDER_PAGE_SIZE, MANAGEMENT_PAYMENT_FILTERS, ORGANIZER_EVENT_SORTS, ORGANIZER_STATUS_GROUPS, type CreateEventRequest, type ManagementAnalyticsBucket, type ManagementAttendanceFilter, type ManagementBookingFilter, type ManagementPaymentFilter, type OrganizerEventSort, type OrganizerEventStatusGroup, type UpdateEventRequest } from "@event-platform/shared-types";
import { Type } from "class-transformer";
import {
  IsBoolean,
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
  MinLength,
} from "class-validator";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ISO_INSTANT_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

export class CreateEventDto implements CreateEventRequest {
  @IsOptional()
  @IsIn(EVENT_LOCALES)
  sourceLocale?: CreateEventRequest["sourceLocale"];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsIn(EVENT_CATEGORIES)
  category!: CreateEventRequest["category"];

  @IsOptional()
  @IsString()
  @IsIn(COUNTRY_CODES)
  countryCode?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  date!: string;

  @IsString()
  @Matches(TIME_PATTERN)
  time!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsIn(EVENT_AGE_RESTRICTIONS)
  ageRestriction?: NonNullable<CreateEventRequest["ageRestriction"]>;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  venueName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  announcement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  program?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  rules?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  visitTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationTerms?: string | null;

  @IsOptional()
  @IsIn(["deposit", "full_payment"])
  paymentMode?: "deposit" | "full_payment";

  @IsOptional()
  @IsBoolean()
  showFullAmountForDeposit?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  depositTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  extraConditions?: string | null;
}

export class UpdateEventDto implements UpdateEventRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(EVENT_CATEGORIES)
  category?: CreateEventRequest["category"];

  @IsOptional()
  @IsString()
  @IsIn(COUNTRY_CODES)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN)
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsIn(EVENT_AGE_RESTRICTIONS)
  ageRestriction?: NonNullable<UpdateEventRequest["ageRestriction"]>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  announcement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  program?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  rules?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  visitTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationTerms?: string | null;

  @IsOptional()
  @IsIn(["deposit", "full_payment"])
  paymentMode?: "deposit" | "full_payment";

  @IsOptional()
  @IsBoolean()
  showFullAmountForDeposit?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  depositTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  extraConditions?: string | null;
}

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
