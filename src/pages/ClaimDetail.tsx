import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClaimStatusSelect } from "@/components/ClaimStatusSelect";
import { ClaimOverview } from "@/components/claim-detail/ClaimOverview";
import { ClaimCommunicationTab } from "@/components/claim-detail/ClaimCommunicationTab";
import { ClaimActivity } from "@/components/claim-detail/ClaimActivity";
import { ClaimFiles } from "@/components/claim-detail/ClaimFiles";
import { ClaimAccounting } from "@/components/claim-detail/ClaimAccounting";
import { ClaimTasks } from "@/components/claim-detail/ClaimTasks";
import { ClaimInspections } from "@/components/claim-detail/ClaimInspections";
import { ClaimTemplates } from "@/components/claim-detail/ClaimTemplates";
import { ClaimAccessManagement } from "@/components/claim-detail/ClaimAccessManagement";
import { EditClaimDialog } from "@/components/claim-detail/EditClaimDialog";
import { DeleteClaimDialog } from "@/components/claim-detail/DeleteClaimDialog";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";

const ClaimDetail = () => {
  const { id } = useParams();
  const { userRole } = useAuth();
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (id) {
      fetchClaim();
    }
  }, [id]);

  const fetchClaim = async () => {
    try {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setClaim(data);
    } catch (error) {
      console.error("Error fetching claim:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (claim) {
      setClaim({ ...claim, status: newStatus });
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!claim) {
    return <div className="p-8">Claim not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/claims">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">{claim.claim_number}</h1>
            <ClaimStatusSelect 
              claimId={claim.id} 
              currentStatus={claim.status}
              onStatusChange={handleStatusChange}
            />
          </div>
          <p className="text-muted-foreground mt-1">{claim.policyholder_name}</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-primary hover:bg-primary/90" onClick={() => setEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Claim
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Claim
          </Button>
        </div>
      </div>

      <EditClaimDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        claim={claim}
        onClaimUpdated={(updatedClaim) => setClaim(updatedClaim)}
      />

      <DeleteClaimDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        claimId={claim.id}
        claimNumber={claim.claim_number}
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-muted/50 rounded-none border-b p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background">Overview</TabsTrigger>
          <TabsTrigger value="communication" className="data-[state=active]:bg-background">Communication</TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-background">Tasks</TabsTrigger>
          <TabsTrigger value="inspections" className="data-[state=active]:bg-background">Inspections</TabsTrigger>
          <TabsTrigger value="activity" className="data-[state=active]:bg-background">Notes & Activity</TabsTrigger>
          <TabsTrigger value="files" className="data-[state=active]:bg-background">Files</TabsTrigger>
          <TabsTrigger value="accounting" className="data-[state=active]:bg-background">Accounting</TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-background">Templates</TabsTrigger>
          <TabsTrigger value="access" className="data-[state=active]:bg-background">Portal Access</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ClaimOverview claim={claim} />
        </TabsContent>

        <TabsContent value="communication" className="mt-6">
          <ClaimCommunicationTab 
            claimId={id || ""} 
            policyholderPhone={claim.policyholder_phone}
            policyholderEmail={claim.policyholder_email}
            policyholderName={claim.policyholder_name}
            claimNumber={claim.claim_number}
          />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <ClaimTasks claimId={id || ""} />
        </TabsContent>

        <TabsContent value="inspections" className="mt-6">
          <ClaimInspections claimId={id || ""} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ClaimActivity claimId={id || ""} />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <ClaimFiles claimId={id || ""} />
        </TabsContent>

        <TabsContent value="accounting" className="mt-6">
          <ClaimAccounting claim={claim} userRole={userRole} />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <ClaimTemplates claimId={id!} claim={claim} />
        </TabsContent>

        <TabsContent value="access" className="mt-6">
          <ClaimAccessManagement claimId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClaimDetail;
