import { ClaimsTableConnected } from "@/components/ClaimsTableConnected";
import { NewClaimDialog } from "@/components/NewClaimDialog";
import { ClaimsAIAssistant } from "@/components/ClaimsAIAssistant";

const Claims = () => {
  return (
    <div className="space-y-4 p-4 md:p-0">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Claims</h1>
            <p className="text-muted-foreground text-sm md:text-base mt-1">Manage all property insurance claims</p>
          </div>
          <NewClaimDialog />
        </div>
        
        <ClaimsTableConnected />
      </div>
      
      <ClaimsAIAssistant />
    </div>
  );
};

export default Claims;
