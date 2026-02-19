/**
 * Canonical Darwin contract types for edge functions.
 * App imports FolderKey from here (see src/lib/darwinContracts.ts).
 * CI must pass: CONTRACT_VERSION matches src/lib/darwinContracts.ts.
 */

export const CONTRACT_VERSION = "2026-02-18";

export type FolderKey =
  | "intake"
  | "policy"
  | "estimates"
  | "photos"
  | "carrier"
  | "supplements"
  | "invoices"
  | "exports";
