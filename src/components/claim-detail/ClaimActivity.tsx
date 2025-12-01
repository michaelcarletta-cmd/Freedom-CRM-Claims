import { Card, CardContent } from "@/components/ui/card";
import { ClaimNotes } from "./ClaimNotes";

interface ClaimActivityProps {
  claimId: string;
}

export function ClaimActivity({ claimId }: ClaimActivityProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <ClaimNotes claimId={claimId} />
      </CardContent>
    </Card>
  );
}
