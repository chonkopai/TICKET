import { loadApiEnv } from "@event-platform/config";
import { Module } from "@nestjs/common";

import { AppleWalletPassGenerator } from "./apple-wallet-pass-generator.js";
import { WALLET_CONFIG, WALLET_PASS_GENERATOR, type WalletConfig } from "./wallet.constants.js";

@Module({
  providers: [
    {
      provide: WALLET_CONFIG,
      useFactory: (): WalletConfig => {
        const env = loadApiEnv();
        return {
          passTypeId: env.APPLE_WALLET_PASS_TYPE_ID,
          teamId: env.APPLE_WALLET_TEAM_ID,
          organizationName: env.APPLE_WALLET_ORGANIZATION_NAME,
          signerCertPath: env.APPLE_WALLET_SIGNER_CERT_PATH,
          signerKeyPath: env.APPLE_WALLET_SIGNER_KEY_PATH,
          signerKeyPassword: env.APPLE_WALLET_SIGNER_KEY_PASSWORD,
          wwdrCertPath: env.APPLE_WALLET_WWDR_CERT_PATH,
          iconPath: env.APPLE_WALLET_ICON_PATH,
        };
      },
    },
    AppleWalletPassGenerator,
    { provide: WALLET_PASS_GENERATOR, useExisting: AppleWalletPassGenerator },
  ],
  exports: [WALLET_PASS_GENERATOR],
})
export class WalletModule {}
