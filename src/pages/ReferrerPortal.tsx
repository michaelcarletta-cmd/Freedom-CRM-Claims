import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimsTableConnected } from "@/components/ClaimsTableConnected";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const ReferrerPortal = () => {
  const { signOut } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Referred Claims</h1>
          <p className="text-muted-foreground mt-1">Track claims you've referred</p>
        </div>
        <Button onClick={signOut} variant="outline">Sign Out</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Referred Claims</CardTitle>
        </CardHeader>
        <CardContent>
          <ClaimsTableConnected portalType="referrer" />
        </CardContent>
      </Card>
    </div>
  );
};

export default ReferrerPortal;
