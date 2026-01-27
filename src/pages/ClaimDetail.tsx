import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClaimStatusSelect } from "@/components/ClaimStatusSelect";
import { ConstructionStatusSelect } from "@/components/ConstructionStatusSelect";
import { ClaimOverview } from "@/components/claim-detail/ClaimOverview";
import { ClaimCommunicationTab } from "@/components/claim-detail/ClaimCommunicationTab";
import { ClaimActivity } from "@/components/claim-detail/ClaimActivity";
import { ClaimFiles } from "@/components/claim-detail/ClaimFiles";
import { ClaimAccounting } from "@/components/claim-detail/ClaimAccounting";
import { ClaimTasks } from "@/components/claim-detail/ClaimTasks";
import { ClaimInspections } from "@/components/claim-detail/ClaimInspections";
import { ClaimAccessManagement } from "@/components/claim-detail/ClaimAccessManagement";
import { ClaimExternalSync } from "@/components/claim-detail/ClaimExternalSync";
import { ClaimAssigned } from "@/components/claim-detail/ClaimAssigned";
import { ClaimPhotos } from "@/components/claim-detail/ClaimPhotos";
import { EditClaimDialog } from "@/components/claim-detail/EditClaimDialog";
import { DeleteClaimDialog } from "@/components/claim-detail/DeleteClaimDialog";
import { NotifyPortalDialog } from "@/components/claim-detail/NotifyPortalDialog";
import { ClaimAutomationSettings } from "@/components/claim-detail/ClaimAutomationSettings";
import { ClaimTimeline } from "@/components/claim-detail/ClaimTimeline";
import { ProofOfLossGenerator } from "@/components/claim-detail/ProofOfLossGenerator";
import { EnhancedEstimateBuilder } from "@/components/claim-detail/EnhancedEstimateBuilder";
import { RecoverableDepreciationInvoice } from "@/components/claim-detail/RecoverableDepreciationInvoice";
import { ShareClaimDialog } from "@/components/claim-detail/ShareClaimDialog";
import { ClaimTabsDropdown } from "@/components/claim-detail/ClaimTabsDropdown";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft, Edit, Trash2, Bell, Brain, Sparkles, Share2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Lazy load Darwin components - they're heavy and only needed when Darwin tab is active
const DarwinDenialAnalyzer = lazy(() => import("@/components/claim-detail/DarwinDenialAnalyzer").then(m => ({ default: m.DarwinDenialAnalyzer })));
const DarwinNextSteps = lazy(() => import("@/components/claim-detail/DarwinNextSteps").then(m => ({ default: m.DarwinNextSteps })));
const DarwinSupplementGenerator = lazy(() => import("@/components/claim-detail/DarwinSupplementGenerator").then(m => ({ default: m.DarwinSupplementGenerator })));
const DarwinCorrespondenceAnalyzer = lazy(() => import("@/components/claim-detail/DarwinCorrespondenceAnalyzer").then(m => ({ default: m.DarwinCorrespondenceAnalyzer })));
const DarwinEngineerReportAnalyzer = lazy(() => import("@/components/claim-detail/DarwinEngineerReportAnalyzer").then(m => ({ default: m.DarwinEngineerReportAnalyzer })));
const DarwinClaimBriefing = lazy(() => import("@/components/claim-detail/DarwinClaimBriefing").then(m => ({ default: m.DarwinClaimBriefing })));
const DarwinDocumentCompiler = lazy(() => import("@/components/claim-detail/DarwinDocumentCompiler").then(m => ({ default: m.DarwinDocumentCompiler })));
const DarwinDemandPackage = lazy(() => import("@/components/claim-detail/DarwinDemandPackage").then(m => ({ default: m.DarwinDemandPackage })));
const DarwinDocumentComparison = lazy(() => import("@/components/claim-detail/DarwinDocumentComparison").then(m => ({ default: m.DarwinDocumentComparison })));
const DarwinSmartExtraction = lazy(() => import("@/components/claim-detail/DarwinSmartExtraction").then(m => ({ default: m.DarwinSmartExtraction })));
const DarwinWeaknessDetection = lazy(() => import("@/components/claim-detail/DarwinWeaknessDetection").then(m => ({ default: m.DarwinWeaknessDetection })));
// Phase 2 Components
const DarwinDeadlineTracker = lazy(() => import("@/components/claim-detail/DarwinDeadlineTracker").then(m => ({ default: m.DarwinDeadlineTracker })));
const DarwinPhotoLinker = lazy(() => import("@/components/claim-detail/DarwinPhotoLinker").then(m => ({ default: m.DarwinPhotoLinker })));
const DarwinBuildingCodes = lazy(() => import("@/components/claim-detail/DarwinBuildingCodes").then(m => ({ default: m.DarwinBuildingCodes })));
// Phase 3 Components
const DarwinSmartFollowUps = lazy(() => import("@/components/claim-detail/DarwinSmartFollowUps").then(m => ({ default: m.DarwinSmartFollowUps })));
const DarwinTaskGenerator = lazy(() => import("@/components/claim-detail/DarwinTaskGenerator").then(m => ({ default: m.DarwinTaskGenerator })));
const DarwinOutcomePredictor = lazy(() => import("@/components/claim-detail/DarwinOutcomePredictor").then(m => ({ default: m.DarwinOutcomePredictor })));
// Brelly-inspired PA/NJ features
const DarwinStateLawAdvisor = lazy(() => import("@/components/claim-detail/DarwinStateLawAdvisor").then(m => ({ default: m.DarwinStateLawAdvisor })));
const DarwinCarrierDeadlineMonitor = lazy(() => import("@/components/claim-detail/DarwinCarrierDeadlineMonitor").then(m => ({ default: m.DarwinCarrierDeadlineMonitor })));
const DarwinLossOfUseCalculator = lazy(() => import("@/components/claim-detail/DarwinLossOfUseCalculator").then(m => ({ default: m.DarwinLossOfUseCalculator })));
// DarwinCommunicationsDiary moved to ClaimNotes (Notes & Updates section)
const DarwinHomeInventoryBuilder = lazy(() => import("@/components/claim-detail/DarwinHomeInventoryBuilder").then(m => ({ default: m.DarwinHomeInventoryBuilder })));
const DarwinHiddenLossDetective = lazy(() => import("@/components/claim-detail/DarwinHiddenLossDetective").then(m => ({ default: m.DarwinHiddenLossDetective })));
const DarwinQualifyingLanguage = lazy(() => import("@/components/claim-detail/DarwinQualifyingLanguage").then(m => ({ default: m.DarwinQualifyingLanguage })));
// New Brelly-inspired features
const DarwinCarrierEmailDrafter = lazy(() => import("@/components/claim-detail/DarwinCarrierEmailDrafter").then(m => ({ default: m.DarwinCarrierEmailDrafter })));
const DarwinWeatherHistory = lazy(() => import("@/components/claim-detail/DarwinWeatherHistory").then(m => ({ default: m.DarwinWeatherHistory })));
const DarwinOneClickPackage = lazy(() => import("@/components/claim-detail/DarwinOneClickPackage").then(m => ({ default: m.DarwinOneClickPackage })));
const DarwinAutoSummary = lazy(() => import("@/components/claim-detail/DarwinAutoSummary").then(m => ({ default: m.DarwinAutoSummary })));
// New Brelly-inspired Smart Features
const DarwinSmartDocumentSort = lazy(() => import("@/components/claim-detail/DarwinSmartDocumentSort").then(m => ({ default: m.DarwinSmartDocumentSort })));
const VisualClaimTimeline = lazy(() => import("@/components/claim-detail/VisualClaimTimeline").then(m => ({ default: m.VisualClaimTimeline })));
const DarwinComplianceChecker = lazy(() => import("@/components/claim-detail/DarwinComplianceChecker").then(m => ({ default: m.DarwinComplianceChecker })));

// Loading fallback for Darwin components
const DarwinLoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
    <span className="text-muted-foreground">Loading Darwin AI module...</span>
  </div>
);

interface Contractor {
  contractor_id: string;
  profiles?: {
    full_name: string | null;
    email: string;
  } | null;
}


const ClaimDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Check if user is a portal user (client, contractor)
  const isPortalUser = userRole === "client" || userRole === "contractor";
  const isStaffOrAdmin = userRole === "admin" || userRole === "staff";

  // Fetch claim with React Query for caching
  const { data: claim, isLoading, error: claimError } = useQuery({
    queryKey: ["claim", id],
    queryFn: async () => {
      console.log("Fetching claim with id:", id, "userRole:", userRole);
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        console.error("Error fetching claim:", error);
        throw error;
      }
      console.log("Claim fetched successfully:", data?.claim_number);
      return data;
    },
    enabled: !!id,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Log any claim fetch errors
  if (claimError) {
    console.error("ClaimDetail query error:", claimError);
  }

  // Fetch contractors with React Query
  const { data: contractors = [] } = useQuery({
    queryKey: ["claim-contractors", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_contractors")
        .select("contractor_id")
        .eq("claim_id", id);
      if (error) throw error;
      return (data || []) as Contractor[];
    },
    enabled: !!id,
    staleTime: 30000,
  });

  // Generate claim-specific email address using policy number
  const getClaimEmail = (claim: any): string => {
    const domain = "claims.freedomclaims.work";
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

  const handleStatusChange = (newStatus: string) => {
    queryClient.setQueryData(["claim", id], (old: any) => 
      old ? { ...old, status: newStatus } : old
    );
  };

  const handleConstructionStatusChange = (newStatus: string) => {
    queryClient.setQueryData(["claim", id], (old: any) => 
      old ? { ...old, construction_status: newStatus } : old
    );
  };

  // Check if this is a workspace claim (synced from partner)
  const isWorkspaceClaim = !!claim?.workspace_id;

  const handleClaimUpdated = (updatedClaim: any) => {
    queryClient.setQueryData(["claim", id], updatedClaim);
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

      queryClient.setQueryData(["claim", id], (old: any) => 
        old ? { ...old, is_closed: newIsClosed } : old
      );
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
    return "/claims";
  };

  // Skeleton loading component
  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6 p-4 md:p-6 bg-background min-h-screen">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-lg" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
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
              {/* Read-only status display for portal users only */}
              {isPortalUser && claim.status && (
                <span className="px-3 py-1 text-sm rounded-none bg-primary text-primary-foreground w-fit">
                  {claim.status}
                </span>
              )}
              {/* Construction status for workspace claims - editable by workspace partners */}
              {isWorkspaceClaim && isStaffOrAdmin && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Construction:</span>
                    <ConstructionStatusSelect 
                      claimId={claim.id}
                      currentStatus={claim.construction_status}
                      onStatusChange={handleConstructionStatusChange}
                    />
                  </div>
                  {claim.partner_construction_status && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Partner:</span>
                      <span className="px-2 py-1 text-xs rounded-sm bg-muted text-muted-foreground">
                        {claim.partner_construction_status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                  )}
                </div>
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
          <div className="inline-flex flex-col md:flex-row items-stretch md:items-center gap-2 md:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareDialogOpen(true)}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotifyDialogOpen(true)}
            >
              <Bell className="h-4 w-4 mr-2" />
              Notify Portal
            </Button>
            <Button
              variant={claim.is_closed ? "outline" : "secondary"}
              size="sm"
              onClick={toggleClosedStatus}
            >
              {claim.is_closed ? "Reopen Claim" : "Close Claim"}
            </Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setEditDialogOpen(true)}>
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
            onClaimUpdated={handleClaimUpdated}
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
            contractors={contractors}
            policyholderName={claim.policyholder_name}
          />

          <ShareClaimDialog
            isOpen={shareDialogOpen}
            onClose={() => setShareDialogOpen(false)}
            onShared={() => queryClient.invalidateQueries({ queryKey: ["claim", id] })}
            claimId={claim.id}
            claimNumber={claim.claim_number}
          />
        </>
      )}

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Mobile: Dropdown selector */}
        {isMobile ? (
          <ClaimTabsDropdown 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            isStaffOrAdmin={isStaffOrAdmin} 
          />
        ) : (
          /* Desktop: Horizontal tabs */
          <TabsList className="flex flex-row w-full bg-muted p-2 gap-1 h-auto rounded-md">
            <TabsTrigger value="overview" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Overview
            </TabsTrigger>
            {isStaffOrAdmin && (
              <TabsTrigger value="assigned" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
                Assigned
              </TabsTrigger>
            )}
            <TabsTrigger value="activity" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Notes & Activity
            </TabsTrigger>
            {isStaffOrAdmin && (
              <TabsTrigger value="tasks" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
                Tasks
              </TabsTrigger>
            )}
            <TabsTrigger value="communication" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Communication
            </TabsTrigger>
            <TabsTrigger value="inspections" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Inspections
            </TabsTrigger>
            <TabsTrigger value="photos" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Photos
            </TabsTrigger>
            <TabsTrigger value="files" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Files
            </TabsTrigger>
            <TabsTrigger value="accounting" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
              Accounting
            </TabsTrigger>
            {isStaffOrAdmin && (
              <TabsTrigger value="access" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
                Portal Access
              </TabsTrigger>
            )}
            {isStaffOrAdmin && (
              <TabsTrigger value="darwin" className="w-auto justify-start text-base font-medium px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
                <Brain className="h-4 w-4 mr-1" />
                Darwin
              </TabsTrigger>
            )}
          </TabsList>
        )}

        <TabsContent value="overview" className="mt-6">
          <ClaimOverview 
            claim={claim} 
            isPortalUser={isPortalUser} 
            onClaimUpdated={handleClaimUpdated}
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

        <TabsContent value="photos" className="mt-6">
          <ClaimPhotos claimId={id || ""} claim={claim} />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <ClaimFiles claimId={id || ""} claim={claim} isStaffOrAdmin={isStaffOrAdmin} />
        </TabsContent>

        <TabsContent value="accounting" className="mt-6">
          <ClaimAccounting claim={claim} userRole={userRole} />
        </TabsContent>

        {isStaffOrAdmin && (
          <TabsContent value="access" className="mt-6 space-y-6">
            <ClaimExternalSync claimId={id!} />
            <ClaimAccessManagement claimId={id!} />
          </TabsContent>
        )}

        {isStaffOrAdmin && (
          <TabsContent value="darwin" className="mt-6">
            <Suspense fallback={<DarwinLoadingFallback />}>
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-semibold">Darwin AI</h2>
                  <span className="text-sm text-muted-foreground">Your intelligent claims assistant</span>
                </div>
                
                {/* Smart Document Sorting - AI-powered file organization */}
                <DarwinSmartDocumentSort claimId={claim.id} claim={claim} />
                
                {/* Visual Claim Timeline - Audit-ready event tracking */}
                <VisualClaimTimeline claimId={claim.id} claim={claim} />
                
                {/* Compliance-Aware Messaging - Flag risky language */}
                <DarwinComplianceChecker claimId={claim.id} claim={claim} />
                
                {/* Auto Claim Summary - Updates on document upload */}
                <DarwinAutoSummary claimId={claim.id} claim={claim} />
                
                {/* Weather History Report */}
                <DarwinWeatherHistory claimId={claim.id} claim={claim} />
                
                {/* Claim Briefing - Get caught up first */}
                <DarwinClaimBriefing claimId={claim.id} claim={claim} />
                
                {/* One-Click Package Builder */}
                <DarwinOneClickPackage claimId={claim.id} claim={claim} />
                
                {/* AI Carrier Email Drafter */}
                <DarwinCarrierEmailDrafter claimId={claim.id} claim={claim} />
                
                {/* Next Steps Predictor */}
                <DarwinNextSteps claimId={claim.id} claim={claim} />
                
                {/* Smart Document Extraction */}
                <DarwinSmartExtraction claimId={claim.id} claim={claim} />
                
                {/* Document Comparison */}
                <DarwinDocumentComparison claimId={claim.id} claim={claim} />
                
                {/* Weakness Detection */}
                <DarwinWeaknessDetection claimId={claim.id} claim={claim} />
                
                {/* Phase 2: Deadline Tracker */}
                <DarwinDeadlineTracker claimId={claim.id} claim={claim} />
                
                {/* Phase 2: Building Codes & Manufacturer Specs */}
                <DarwinBuildingCodes claimId={claim.id} claim={claim} />
                
                {/* Phase 2: Photo-Document Linker */}
                <DarwinPhotoLinker claimId={claim.id} claim={claim} />
                
                {/* AI Analysis Tools */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <DarwinDenialAnalyzer claimId={claim.id} claim={claim} />
                  <DarwinSupplementGenerator claimId={claim.id} claim={claim} />
                </div>
                
                <div className="grid gap-6 lg:grid-cols-2">
                  <DarwinEngineerReportAnalyzer claimId={claim.id} claim={claim} />
                  <DarwinCorrespondenceAnalyzer claimId={claim.id} claim={claim} />
                </div>
                
                {/* Demand Package Builder - Primary tool for building cases from evidence */}
                <DarwinDemandPackage claimId={claim.id} claim={claim} />
                
                {/* Recoverable Depreciation Invoice - Generate RD invoice with Certificate of Completion docs */}
                <RecoverableDepreciationInvoice claimId={claim.id} claim={claim} />
                
                {/* Document Compiler - Legacy tool for compiling photos and documents */}
                <DarwinDocumentCompiler claimId={claim.id} claim={claim} />
                
                {/* Document Generation Tools */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Document Generation
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <ProofOfLossGenerator claimId={claim.id} claim={claim} />
                    <EnhancedEstimateBuilder claimId={claim.id} claim={claim} />
                  </div>
                </div>
                
                {/* Legacy AI Claim Timeline */}
                <ClaimTimeline claimId={id || ""} claim={claim} />
                
                {/* PA/NJ Brelly-Inspired Tools */}
                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    PA/NJ Regulatory Tools
                  </h3>
                  
                  {/* State Law Advisor */}
                  <DarwinStateLawAdvisor claimId={claim.id} claim={claim} />
                  
                  {/* Carrier Deadline Monitor */}
                  <DarwinCarrierDeadlineMonitor claimId={claim.id} claim={claim} />
                  
                  {/* Communications Diary moved to Notes & Updates section */}
                  
                  {/* Qualifying Language Generator */}
                  <DarwinQualifyingLanguage claimId={claim.id} claim={claim} />
                </div>
                
                {/* Contents & Loss Tracking */}
                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Contents & Hidden Loss Tools
                  </h3>
                  
                  {/* Loss of Use Calculator */}
                  <DarwinLossOfUseCalculator claimId={claim.id} claim={claim} />
                  
                  {/* Home Inventory Builder */}
                  <DarwinHomeInventoryBuilder claimId={claim.id} claim={claim} />
                  
                  {/* Hidden Loss Detective */}
                  <DarwinHiddenLossDetective claimId={claim.id} claim={claim} />
                </div>
                
                {/* AI Automation Settings */}
                <ClaimAutomationSettings claimId={id!} />
              </div>
            </Suspense>
          </TabsContent>
        )}
      </Tabs>

      {isStaffOrAdmin && activeTab === "overview" && (
        <div className="pt-6 border-t border-destructive/30">
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