import { Card, CardContent } from "@/components/ui/card";
import { ClaimNotes } from "./ClaimNotes";

interface ClaimActivityProps {
  claimId: string;
  isPortalUser?: boolean;
}

export function ClaimActivity({ claimId, isPortalUser = false }: ClaimActivityProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <ClaimNotes claimId={claimId} isPortalUser={isPortalUser} />
      </CardContent>
    </Card>
  );
}
