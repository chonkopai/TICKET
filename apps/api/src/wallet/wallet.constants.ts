export const WALLET_CONFIG = Symbol("WALLET_CONFIG");
export const WALLET_PASS_GENERATOR = Symbol("WALLET_PASS_GENERATOR");

export interface WalletConfig {
  passTypeId: string | undefined;
  teamId: string | undefined;
  organizationName: string | undefined;
  signerCertPath: string | undefined;
  signerKeyPath: string | undefined;
  signerKeyPassword: string | undefined;
  wwdrCertPath: string | undefined;
  iconPath: string | undefined;
}
