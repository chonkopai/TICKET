import type { Prisma } from "@event-platform/database";
import type { CheckoutEmailChoice } from "@event-platform/shared-types";
import { BadRequestException, Injectable } from "@nestjs/common";

import { normalizeContact } from "../auth/contact-identity.js";
import { VerificationService } from "../auth/verification.service.js";

@Injectable()
export class CheckoutEmailService {
  constructor(private readonly verification: VerificationService) {}

  async resolve(
    tx: Prisma.TransactionClient,
    userId: string,
    choice: CheckoutEmailChoice | undefined,
    sessionFamilyId?: string,
    anonymous?: { id: string; verifiedEmail: string | null },
  ): Promise<string | null> {
    if (!choice) return null;
    const address = normalizeContact("email", choice.address);
    if (anonymous) {
      if (anonymous.verifiedEmail !== address) throw new BadRequestException({ code: "CHECKOUT_EMAIL_NOT_VERIFIED" });
      return address;
    }
    const linked = await tx.contactIdentity.findUnique({ where: { method_normalizedIdentifier: { method: "email", normalizedIdentifier: address } } });
    if (linked?.userId === userId) return address;
    if (!choice.grant || !sessionFamilyId) throw new BadRequestException({ code: "CHECKOUT_EMAIL_NOT_VERIFIED" });
    await this.verification.claimGrant(tx, { purpose: "checkout_email", method: "email", target: address, userId, sessionFamilyId, grant: choice.grant });
    return address;
  }
}
