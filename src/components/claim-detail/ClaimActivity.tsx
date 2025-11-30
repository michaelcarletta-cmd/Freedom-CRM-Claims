import { Card, CardContent } from "@/components/ui/card";
import { ClaimNotes } from "./ClaimNotes";
import { ClaimTimeline } from "./ClaimTimeline";

interface ClaimActivityProps {
  claimId: string;
}

export function ClaimActivity({ claimId }: ClaimActivityProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardContent className="pt-6">
            <ClaimNotes claimId={claimId} />
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-1">
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-4">Activity Timeline</h3>
            <ClaimTimeline claimId={claimId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
