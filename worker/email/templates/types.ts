import type { ConfirmationEmailData } from "../types";

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export type { ConfirmationEmailData };
