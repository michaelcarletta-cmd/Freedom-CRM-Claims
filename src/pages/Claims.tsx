import { ClaimsTableConnected } from "@/components/ClaimsTableConnected";
import { NewClaimDialog } from "@/components/NewClaimDialog";

const Claims = () => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Claims</h1>
            <p className="text-muted-foreground mt-1">Manage all property insurance claims</p>
          </div>
          <NewClaimDialog />
        </div>
        
        <ClaimsTableConnected />
      </div>
    </div>
  );
};

export default Claims;
