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
import { ClaimAccessManagement } from "@/components/claim-detail/ClaimAccessManagement";
import { ClaimAssigned } from "@/components/claim-detail/ClaimAssigned";
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
  user_id: string | null;
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
  const [activeTab, setActiveTab] = useState("overview");
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [referrer, setReferrer] = useState<Referrer | null>(null);

  // Check if user is a portal user (client, contractor, referrer)
  const isPortalUser = userRole === "client" || userRole === "contractor" || userRole === "referrer";
  const isStaffOrAdmin = userRole === "admin" || userRole === "staff";

  // Generate claim-specific email address using policy number
  const getClaimEmail = (claim: any): string => {
    const domain = "claims.freedom.com";
    if (claim.policy_number) {
      // Sanitize policy number: lowercase, replace non-alphanumeric with hyphens
      const sanitized = claim.policy_number
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      return `claim-${sanitized}@${domain}`;
    }
    // Fallback to claim_email_id if no policy number
    return `claim-${claim.claim_email_id}@${domain}`;
  };

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
        .select("id, name, email, user_id")
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
    <div className="space-y-4 md:space-y-6 p-4 md:p-6 bg-background min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link to={getBackLink()}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{claim.claim_number}</h1>
              {isStaffOrAdmin && (
                <ClaimStatusSelect 
                  claimId={claim.id} 
                  currentStatus={claim.status}
                  onStatusChange={handleStatusChange}
                />
              )}
              {isPortalUser && claim.status && (
                <span className="px-3 py-1 text-sm rounded-none bg-primary text-primary-foreground w-fit">
                  {claim.status}
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 font-medium">{claim.policyholder_name}</p>
            {isStaffOrAdmin && (claim.policy_number || claim.claim_email_id) && (
              <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                Claim Email: {getClaimEmail(claim)}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="ml-2 h-6 px-2 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(getClaimEmail(claim));
                    toast({ title: "Copied", description: "Claim email copied to clipboard" });
                  }}
                >
                  Copy
                </Button>
              </p>
            )}
          </div>
        </div>
        {isStaffOrAdmin && (
          <div className="flex flex-col md:flex-row flex-wrap gap-2 md:ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
              onClick={() => setNotifyDialogOpen(true)}
            >
              <Bell className="h-4 w-4 mr-2" />
              Notify Portal
            </Button>
            <Button
              variant={claim.is_closed ? "outline" : "secondary"}
              size="sm"
              className="w-full md:w-auto"
              onClick={toggleClosedStatus}
            >
              {claim.is_closed ? "Reopen Claim" : "Close Claim"}
            </Button>
            <Button size="sm" className="w-full md:w-auto bg-primary hover:bg-primary/90" onClick={() => setEditDialogOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Claim
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

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-col md:flex-row w-full bg-muted p-2 gap-1 h-auto rounded-md">
          <TabsTrigger value="overview" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Overview
          </TabsTrigger>
          {isStaffOrAdmin && (
            <TabsTrigger value="assigned" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Assigned
            </TabsTrigger>
          )}
          <TabsTrigger value="activity" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Notes & Activity
          </TabsTrigger>
          {isStaffOrAdmin && (
            <TabsTrigger value="tasks" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Tasks
            </TabsTrigger>
          )}
          <TabsTrigger value="communication" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Communication
          </TabsTrigger>
          <TabsTrigger value="inspections" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Inspections
          </TabsTrigger>
          <TabsTrigger value="files" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Files
          </TabsTrigger>
          <TabsTrigger value="accounting" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Accounting
          </TabsTrigger>
          {isStaffOrAdmin && (
            <TabsTrigger value="access" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Portal Access
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ClaimOverview 
            claim={claim} 
            isPortalUser={isPortalUser} 
            onClaimUpdated={(updatedClaim) => setClaim(updatedClaim)}
          />
        </TabsContent>

        {isStaffOrAdmin && (
          <TabsContent value="assigned" className="mt-6">
            <ClaimAssigned claim={claim} />
          </TabsContent>
        )}

        <TabsContent value="activity" className="mt-6">
          <ClaimActivity claimId={id || ""} />
        </TabsContent>

        {isStaffOrAdmin && (
          <TabsContent value="tasks" className="mt-6">
            <ClaimTasks claimId={id || ""} />
          </TabsContent>
        )}

        <TabsContent value="communication" className="mt-6">
          <ClaimCommunicationTab 
            claimId={id || ""} 
            claim={claim}
          />
        </TabsContent>

        <TabsContent value="inspections" className="mt-6">
          <ClaimInspections claimId={id || ""} />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <ClaimFiles claimId={id || ""} claim={claim} isStaffOrAdmin={isStaffOrAdmin} />
        </TabsContent>

        <TabsContent value="accounting" className="mt-6">
          <ClaimAccounting claim={claim} userRole={userRole} />
        </TabsContent>

        {isStaffOrAdmin && (
          <TabsContent value="access" className="mt-6">
            <ClaimAccessManagement claimId={id!} />
          </TabsContent>
        )}
      </Tabs>

      {isStaffOrAdmin && activeTab === "overview" && (
        <div className="mt-12 pt-6 border-t border-destructive/30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
              <p className="text-sm text-muted-foreground">Permanently delete this claim and all associated data</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Claim
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimDetail;