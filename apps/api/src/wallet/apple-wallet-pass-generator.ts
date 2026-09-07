import { readFile } from "node:fs/promises";

import { Inject, Injectable } from "@nestjs/common";
import { PKPass } from "passkit-generator";

import { WALLET_CONFIG, type WalletConfig } from "./wallet.constants.js";
import type { WalletPassGenerator, WalletPassInput } from "./wallet-pass-generator.js";

@Injectable()
export class AppleWalletPassGenerator implements WalletPassGenerator {
  constructor(@Inject(WALLET_CONFIG) private readonly config: WalletConfig) {}

  isConfigured(): boolean {
    const config = this.config;
    return Boolean(
      config.passTypeId
      && config.teamId
      && config.organizationName
      && config.signerCertPath
      && config.signerKeyPath
      && config.wwdrCertPath
      && config.iconPath,
    );
  }

  async generate(input: WalletPassInput): Promise<Buffer> {
    if (!this.isConfigured()) throw new Error("Apple Wallet is not configured");
    const config = this.config as WalletConfig & {
      passTypeId: string;
      teamId: string;
      organizationName: string;
      signerCertPath: string;
      signerKeyPath: string;
      wwdrCertPath: string;
      iconPath: string;
    };
    const [wwdr, signerCert, signerKey, icon] = await Promise.all([
      readFile(config.wwdrCertPath),
      readFile(config.signerCertPath),
      readFile(config.signerKeyPath),
      readFile(config.iconPath),
    ]);

    const pass = new PKPass(
      { "icon.png": icon, "icon@2x.png": icon },
      {
        wwdr,
        signerCert,
        signerKey,
        ...(config.signerKeyPassword ? { signerKeyPassphrase: config.signerKeyPassword } : {}),
      },
      {
        formatVersion: 1,
        passTypeIdentifier: config.passTypeId,
        teamIdentifier: config.teamId,
        organizationName: config.organizationName,
        serialNumber: input.serialNumber,
        description: input.eventTitle,
        logoText: input.eventTitle,
        foregroundColor: "rgb(255, 255, 255)",
        backgroundColor: "rgb(24, 24, 27)",
      },
    );
    pass.type = "eventTicket";
    pass.primaryFields.push({ key: "event", label: "МЕРОПРИЯТИЕ", value: input.eventTitle });
    pass.secondaryFields.push({
      key: "ticketType",
      label: "ТИП БИЛЕТА",
      value: input.ticketTypeName,
    });
    pass.auxiliaryFields.push(
      { key: "date", label: "ДАТА", value: input.eventDate },
      { key: "time", label: "ВРЕМЯ", value: `${input.eventTime} (${input.timezone})` },
    );
    pass.backFields.push(
      { key: "venue", label: "ПЛОЩАДКА", value: input.venueName },
      { key: "address", label: "АДРЕС", value: input.address },
    );
    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: input.qrToken,
      messageEncoding: "iso-8859-1",
      altText: input.serialNumber,
    });
    return pass.getAsBuffer();
  }
}
