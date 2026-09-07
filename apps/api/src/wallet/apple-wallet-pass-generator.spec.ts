import { describe, expect, it } from "vitest";

import { AppleWalletPassGenerator } from "./apple-wallet-pass-generator.js";
import type { WalletConfig } from "./wallet.constants.js";

const emptyConfig: WalletConfig = {
  passTypeId: undefined,
  teamId: undefined,
  organizationName: undefined,
  signerCertPath: undefined,
  signerKeyPath: undefined,
  signerKeyPassword: undefined,
  wwdrCertPath: undefined,
  iconPath: undefined,
};

describe("AppleWalletPassGenerator", () => {
  it("stays disabled until every required identity, certificate and asset is present", () => {
    expect(new AppleWalletPassGenerator(emptyConfig).isConfigured()).toBe(false);
    expect(new AppleWalletPassGenerator({
      ...emptyConfig,
      passTypeId: "pass.com.example.event",
      teamId: "TEAM123456",
      organizationName: "Event Platform",
      signerCertPath: "/secure/signer.pem",
      signerKeyPath: "/secure/signer-key.pem",
      wwdrCertPath: "/secure/wwdr.pem",
      iconPath: "/secure/icon.png",
    }).isConfigured()).toBe(true);
  });
});
