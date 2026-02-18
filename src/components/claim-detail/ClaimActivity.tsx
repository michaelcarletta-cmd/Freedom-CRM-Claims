import { Card, CardContent } from "@/components/ui/card";
import { ClaimNotes } from "./ClaimNotes";

interface ClaimActivityProps {
  claimId: string;
  claim?: any;
  isPortalUser?: boolean;
}

export function ClaimActivity({ claimId, claim, isPortalUser = false }: ClaimActivityProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <ClaimNotes claimId={claimId} claim={claim} isPortalUser={isPortalUser} />
      </CardContent>
    </Card>
  );
}
