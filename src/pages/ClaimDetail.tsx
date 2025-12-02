import { useParams, Link, useNavigate } from "react-router-dom";
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
import { NotifyPortalDialog } from "@/components/claim-detail/NotifyPortalDialog";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Edit, Trash2, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Contractor {
  contractor_id: string;
  profiles?: {
    full_name: string | null;
    email: string;
  } | null;
}

interface Referrer {
  id: string;
  name: string;
  email: string | null;
}

const ClaimDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [referrer, setReferrer] = useState<Referrer | null>(null);

  // Check if user is a portal user (client, contractor, referrer)
  const isPortalUser = userRole === "client" || userRole === "contractor" || userRole === "referrer";
  const isStaffOrAdmin = userRole === "admin" || userRole === "staff";

  useEffect(() => {
    if (id) {
      fetchClaim();
      fetchContractors();
    }
  }, [id]);

  useEffect(() => {
    if (claim?.referrer_id) {
      fetchReferrer(claim.referrer_id);
    }
  }, [claim?.referrer_id]);

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

  const fetchContractors = async () => {
    try {
      const { data, error } = await supabase
        .from("claim_contractors")
        .select("contractor_id")
        .eq("claim_id", id);

      if (error) throw error;
      setContractors(data || []);
    } catch (error) {
      console.error("Error fetching contractors:", error);
    }
  };

  const fetchReferrer = async (referrerId: string) => {
    try {
      const { data, error } = await supabase
        .from("referrers")
        .select("id, name, email")
        .eq("id", referrerId)
        .maybeSingle();

      if (error) throw error;
      setReferrer(data);
    } catch (error) {
      console.error("Error fetching referrer:", error);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (claim) {
      setClaim({ ...claim, status: newStatus });
    }
  };

  const toggleClosedStatus = async () => {
    if (!id || !claim) return;

    try {
      const newIsClosed = !claim.is_closed;

      const { error } = await supabase
        .from("claims")
        .update({ is_closed: newIsClosed })
        .eq("id", id);

      if (error) throw error;

      setClaim({ ...claim, is_closed: newIsClosed });
      toast({
        title: "Status updated",
        description: newIsClosed
          ? "Claim has been closed and removed from the active list."
          : "Claim has been reopened.",
      });
    } catch (error: any) {
      console.error("Error toggling closed status:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update claim status",
        variant: "destructive",
      });
    }
  };

  const getBackLink = () => {
    if (userRole === "client") return "/client-portal";
    if (userRole === "contractor") return "/contractor-portal";
    if (userRole === "referrer") return "/referrer-portal";
    return "/claims";
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!claim) {
    return <div className="p-8">Claim not found</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link to={getBackLink()}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">{claim.claim_number}</h1>
            {isStaffOrAdmin && (
              <ClaimStatusSelect 
                claimId={claim.id} 
                currentStatus={claim.status}
                onStatusChange={handleStatusChange}
              />
            )}
            {isPortalUser && claim.status && (
              <span className="px-3 py-1 text-sm rounded-full bg-muted text-muted-foreground">
                {claim.status}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{claim.policyholder_name}</p>
        </div>
        {isStaffOrAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setNotifyDialogOpen(true)}
            >
              <Bell className="h-4 w-4 mr-2" />
              Notify Portal
            </Button>
            <Button
              variant={claim.is_closed ? "outline" : "secondary"}
              onClick={toggleClosedStatus}
            >
              {claim.is_closed ? "Reopen Claim" : "Close Claim"}
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setEditDialogOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Claim
            </Button>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Claim
            </Button>
          </div>
        )}
      </div>

      {isStaffOrAdmin && (
        <>
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

          <NotifyPortalDialog
            open={notifyDialogOpen}
            onOpenChange={setNotifyDialogOpen}
            claimId={claim.id}
            clientId={claim.client_id}
            referrerId={claim.referrer_id}
            contractors={contractors}
            policyholderName={claim.policyholder_name}
            referrer={referrer}
          />
        </>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-row w-full bg-muted/40 p-2 gap-1 overflow-x-auto scrollbar-hide h-auto">
          <TabsTrigger value="overview" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="communication" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
            Communication
          </TabsTrigger>
          {isStaffOrAdmin && (
            <TabsTrigger value="tasks" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
              Tasks
            </TabsTrigger>
          )}
          <TabsTrigger value="inspections" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
            Inspections
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
            Notes & Activity
          </TabsTrigger>
          <TabsTrigger value="files" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
            Files
          </TabsTrigger>
          <TabsTrigger value="accounting" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
            Accounting
          </TabsTrigger>
          {isStaffOrAdmin && (
            <>
              <TabsTrigger value="templates" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
                Templates
              </TabsTrigger>
              <TabsTrigger value="access" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground">
                Portal Access
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ClaimOverview claim={claim} isPortalUser={isPortalUser} />
        </TabsContent>

        <TabsContent value="communication" className="mt-6">
          <ClaimCommunicationTab 
            claimId={id || ""} 
            claim={claim}
          />
        </TabsContent>

        {isStaffOrAdmin && (
          <TabsContent value="tasks" className="mt-6">
            <ClaimTasks claimId={id || ""} />
          </TabsContent>
        )}

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

        {isStaffOrAdmin && (
          <>
            <TabsContent value="templates" className="mt-6">
              <ClaimTemplates claimId={id!} claim={claim} />
            </TabsContent>

            <TabsContent value="access" className="mt-6">
              <ClaimAccessManagement claimId={id!} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

export default ClaimDetail;