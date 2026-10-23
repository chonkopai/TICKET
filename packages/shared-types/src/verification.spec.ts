import { describe, expect, it } from "vitest";
import { verificationSchema } from "./administration.js";

const application = {
  legalName: "Example Organization", entityType: "ip", countryCode: "KZ",
  registrationId: "123456", email: "organizer@example.com", phone: "+77001234567",
  fileIds: ["123e4567-e89b-42d3-a456-426614174000"],
};

describe("organizer entity details", () => {
  it("keeps standard applications compatible", () => {
    expect(verificationSchema.safeParse(application).success).toBe(true);
  });
  it("requires a description when other is selected", () => {
    for (const entityTypeDetails of [undefined, "", "   ", "x"]) {
      expect(verificationSchema.safeParse({ ...application, entityType: "other", entityTypeDetails }).success).toBe(false);
    }
  });
  it("accepts and trims a custom entity description", () => {
    expect(verificationSchema.parse({ ...application, entityType: "other", entityTypeDetails: "  Nonprofit association  " }).entityTypeDetails).toBe("Nonprofit association");
  });
  it("rejects oversized descriptions and details on standard entities", () => {
    expect(verificationSchema.safeParse({ ...application, entityType: "other", entityTypeDetails: "x".repeat(121) }).success).toBe(false);
    expect(verificationSchema.safeParse({ ...application, entityTypeDetails: "Nonprofit" }).success).toBe(false);
  });
});
