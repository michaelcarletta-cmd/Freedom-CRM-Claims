/**
 * EvidenceIndex client: fetch ClaimFactsPack from darwin-evidence-index.
 * Types live in darwinContracts.ts.
 */
import type { ClaimFactsPack } from "./darwinContracts";

export type { ClaimFactsPack } from "./darwinContracts";

export type EvidenceIndexResponse = {
  success: boolean;
  claimFactsPack: ClaimFactsPack;
  builtAt: string;
  claimId: string;
};

export async function fetchClaimFactsPack(
  supabase: {
    functions: {
      invoke: (
        name: string,
        opts: { body: object }
      ) => Promise<{ data: EvidenceIndexResponse | null; error: unknown }>;
    };
  },
  claimId: string
): Promise<ClaimFactsPack | null> {
  const { data, error } = await supabase.functions.invoke(
    "darwin-evidence-index",
    { body: { claimId } }
  );
  if (error || !data?.success) return null;
  return data.claimFactsPack ?? null;
}
