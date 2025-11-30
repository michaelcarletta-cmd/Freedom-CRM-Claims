import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimsTableConnected } from "@/components/ClaimsTableConnected";
import { NewClaimDialog } from "@/components/NewClaimDialog";

const Claims = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Claims</h1>
          <p className="text-muted-foreground mt-1">Manage all property insurance claims</p>
        </div>
        <NewClaimDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Claims</CardTitle>
        </CardHeader>
        <CardContent>
          <ClaimsTableConnected />
        </CardContent>
      </Card>
    </div>
  );
};

export default Claims;
