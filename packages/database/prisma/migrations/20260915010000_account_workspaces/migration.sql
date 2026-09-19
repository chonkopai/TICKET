ALTER TABLE "User" ADD COLUMN "defaultCity" TEXT;

CREATE TABLE "OrganizerProfile" (
  "userId" UUID NOT NULL,
  "organizationName" VARCHAR(160) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizerProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "OrganizerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserNotificationPreference" (
  "userId" UUID NOT NULL,
  "transactionalTicketDelivery" BOOLEAN NOT NULL DEFAULT true,
  "eventReminders" BOOLEAN NOT NULL DEFAULT true,
  "marketingAnnouncements" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
