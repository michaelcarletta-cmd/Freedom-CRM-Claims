import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimsTable } from "@/components/ClaimsTable";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const Claims = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Claims</h1>
          <p className="text-muted-foreground mt-1">Manage all property insurance claims</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          New Claim
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Claims</CardTitle>
        </CardHeader>
        <CardContent>
          <ClaimsTable />
        </CardContent>
      </Card>
    </div>
  );
};

export default Claims;
