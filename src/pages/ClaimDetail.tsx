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
import { ArrowLeft, Edit } from "lucide-react";

const ClaimDetail = () => {
  const { id } = useParams();
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
        <Button className="bg-primary hover:bg-primary/90">
          <Edit className="h-4 w-4 mr-2" />
          Edit Claim
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="activity">Notes & Activity</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="access">Portal Access</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ClaimOverview claim={claim} />
        </TabsContent>

        <TabsContent value="communication" className="mt-6">
          <ClaimCommunicationTab claimId={id || ""} policyholderPhone={claim.policyholder_phone} />
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
          <ClaimAccounting claim={claim} />
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
