export const DEPED_DOMAIN = "@deped.gov.ph";

export const isDepedEmail = (email: string): boolean =>
  email.trim().toLowerCase().endsWith(DEPED_DOMAIN);
