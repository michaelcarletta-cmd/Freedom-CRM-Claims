import { useState, lazy, Suspense } from "react";
import { Brain, ChevronDown, ChevronRight, Loader2, MessageSquare, FileText, Shield, Calculator, Zap, Search, Clock, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Lazy load all Darwin components
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
const DarwinDeadlineTracker = lazy(() => import("@/components/claim-detail/DarwinDeadlineTracker").then(m => ({ default: m.DarwinDeadlineTracker })));
const DarwinPhotoLinker = lazy(() => import("@/components/claim-detail/DarwinPhotoLinker").then(m => ({ default: m.DarwinPhotoLinker })));
const DarwinBuildingCodes = lazy(() => import("@/components/claim-detail/DarwinBuildingCodes").then(m => ({ default: m.DarwinBuildingCodes })));
const DarwinSmartFollowUps = lazy(() => import("@/components/claim-detail/DarwinSmartFollowUps").then(m => ({ default: m.DarwinSmartFollowUps })));
const DarwinTaskGenerator = lazy(() => import("@/components/claim-detail/DarwinTaskGenerator").then(m => ({ default: m.DarwinTaskGenerator })));
const DarwinOutcomePredictor = lazy(() => import("@/components/claim-detail/DarwinOutcomePredictor").then(m => ({ default: m.DarwinOutcomePredictor })));
const DarwinStateLawAdvisor = lazy(() => import("@/components/claim-detail/DarwinStateLawAdvisor").then(m => ({ default: m.DarwinStateLawAdvisor })));
const DarwinCarrierDeadlineMonitor = lazy(() => import("@/components/claim-detail/DarwinCarrierDeadlineMonitor").then(m => ({ default: m.DarwinCarrierDeadlineMonitor })));
const DarwinLossOfUseCalculator = lazy(() => import("@/components/claim-detail/DarwinLossOfUseCalculator").then(m => ({ default: m.DarwinLossOfUseCalculator })));
const DarwinHomeInventoryBuilder = lazy(() => import("@/components/claim-detail/DarwinHomeInventoryBuilder").then(m => ({ default: m.DarwinHomeInventoryBuilder })));
const DarwinHiddenLossDetective = lazy(() => import("@/components/claim-detail/DarwinHiddenLossDetective").then(m => ({ default: m.DarwinHiddenLossDetective })));
const DarwinQualifyingLanguage = lazy(() => import("@/components/claim-detail/DarwinQualifyingLanguage").then(m => ({ default: m.DarwinQualifyingLanguage })));
const DarwinCarrierEmailDrafter = lazy(() => import("@/components/claim-detail/DarwinCarrierEmailDrafter").then(m => ({ default: m.DarwinCarrierEmailDrafter })));
const DarwinWeatherHistory = lazy(() => import("@/components/claim-detail/DarwinWeatherHistory").then(m => ({ default: m.DarwinWeatherHistory })));
const DarwinOneClickPackage = lazy(() => import("@/components/claim-detail/DarwinOneClickPackage").then(m => ({ default: m.DarwinOneClickPackage })));
const DarwinAutoSummary = lazy(() => import("@/components/claim-detail/DarwinAutoSummary").then(m => ({ default: m.DarwinAutoSummary })));
const DarwinSmartDocumentSort = lazy(() => import("@/components/claim-detail/DarwinSmartDocumentSort").then(m => ({ default: m.DarwinSmartDocumentSort })));
const VisualClaimTimeline = lazy(() => import("@/components/claim-detail/VisualClaimTimeline").then(m => ({ default: m.VisualClaimTimeline })));
const DarwinComplianceChecker = lazy(() => import("@/components/claim-detail/DarwinComplianceChecker").then(m => ({ default: m.DarwinComplianceChecker })));
const ClaimTimeline = lazy(() => import("@/components/claim-detail/ClaimTimeline").then(m => ({ default: m.ClaimTimeline })));
const ProofOfLossGenerator = lazy(() => import("@/components/claim-detail/ProofOfLossGenerator").then(m => ({ default: m.ProofOfLossGenerator })));
const EnhancedEstimateBuilder = lazy(() => import("@/components/claim-detail/EnhancedEstimateBuilder").then(m => ({ default: m.EnhancedEstimateBuilder })));
const RecoverableDepreciationInvoice = lazy(() => import("@/components/claim-detail/RecoverableDepreciationInvoice").then(m => ({ default: m.RecoverableDepreciationInvoice })));
const ClaimAutomationSettings = lazy(() => import("@/components/claim-detail/ClaimAutomationSettings").then(m => ({ default: m.ClaimAutomationSettings })));

interface DarwinTabProps {
  claimId: string;
  claim: any;
}

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-6">
    <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
    <span className="text-sm text-muted-foreground">Loading...</span>
  </div>
);

interface ToolCategoryProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const ToolCategory = ({ title, description, icon, defaultOpen = false, children }: ToolCategoryProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-border/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10 text-primary">
                  {icon}
                </div>
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription className="text-xs">{description}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <Suspense fallback={<LoadingFallback />}>
              {children}
            </Suspense>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export const DarwinTab = ({ claimId, claim }: DarwinTabProps) => {
  const [showCopilot, setShowCopilot] = useState(true);

  return (
    <div className="space-y-6">
      {/* Darwin Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Darwin AI</h2>
            <p className="text-sm text-muted-foreground">Your intelligent claims copilot</p>
          </div>
        </div>
        <Button
          variant={showCopilot ? "default" : "outline"}
          size="sm"
          onClick={() => setShowCopilot(!showCopilot)}
          className="gap-2"
        >
          <MessageSquare className="h-4 w-4" />
          {showCopilot ? "Hide Chat" : "Show Chat"}
        </Button>
      </div>

      {/* Main Layout: Copilot + Tools */}
      <div className={cn("grid gap-6", showCopilot ? "lg:grid-cols-[1fr,400px]" : "grid-cols-1")}>
        {/* Tools Column */}
        <div className="space-y-4 order-2 lg:order-1">
          {/* Quick Actions - Always visible */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Suspense fallback={<LoadingFallback />}>
                <DarwinAutoSummary claimId={claimId} claim={claim} />
                <DarwinOneClickPackage claimId={claimId} claim={claim} />
                <ProofOfLossGenerator claimId={claimId} claim={claim} />
                <EnhancedEstimateBuilder claimId={claimId} claim={claim} />
              </Suspense>
            </CardContent>
          </Card>

          {/* Claim Intelligence */}
          <ToolCategory
            title="Claim Intelligence"
            description="AI-powered insights and recommendations"
            icon={<Search className="h-4 w-4" />}
            defaultOpen={true}
          >
            <DarwinClaimBriefing claimId={claimId} claim={claim} />
            <DarwinNextSteps claimId={claimId} claim={claim} />
            <DarwinWeatherHistory claimId={claimId} claim={claim} />
            <DarwinWeaknessDetection claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Document Analysis */}
          <ToolCategory
            title="Document Analysis"
            description="Analyze and compare claim documents"
            icon={<FileText className="h-4 w-4" />}
          >
            <DarwinSmartExtraction claimId={claimId} claim={claim} />
            <DarwinDocumentComparison claimId={claimId} claim={claim} />
            <DarwinSmartDocumentSort claimId={claimId} claim={claim} />
            <DarwinPhotoLinker claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Rebuttals & Responses */}
          <ToolCategory
            title="Rebuttals & Responses"
            description="Counter carrier denials and engineer reports"
            icon={<Shield className="h-4 w-4" />}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <DarwinDenialAnalyzer claimId={claimId} claim={claim} />
              <DarwinEngineerReportAnalyzer claimId={claimId} claim={claim} />
            </div>
            <DarwinSupplementGenerator claimId={claimId} claim={claim} />
            <DarwinCorrespondenceAnalyzer claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Package Building */}
          <ToolCategory
            title="Package Building"
            description="Generate demand packages and documents"
            icon={<Sparkles className="h-4 w-4" />}
          >
            <DarwinDemandPackage claimId={claimId} claim={claim} />
            <RecoverableDepreciationInvoice claimId={claimId} claim={claim} />
            <DarwinDocumentCompiler claimId={claimId} claim={claim} />
            <DarwinCarrierEmailDrafter claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Regulatory & Compliance */}
          <ToolCategory
            title="Regulatory & Compliance"
            description="PA/NJ regulations, deadlines, and compliance"
            icon={<Clock className="h-4 w-4" />}
          >
            <DarwinStateLawAdvisor claimId={claimId} claim={claim} />
            <DarwinCarrierDeadlineMonitor claimId={claimId} claim={claim} />
            <DarwinDeadlineTracker claimId={claimId} claim={claim} />
            <DarwinQualifyingLanguage claimId={claimId} claim={claim} />
            <DarwinComplianceChecker claimId={claimId} claim={claim} />
            <DarwinBuildingCodes claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Contents & Loss Tracking */}
          <ToolCategory
            title="Contents & Loss Tracking"
            description="Inventory, ALE, and hidden loss detection"
            icon={<Calculator className="h-4 w-4" />}
          >
            <DarwinLossOfUseCalculator claimId={claimId} claim={claim} />
            <DarwinHomeInventoryBuilder claimId={claimId} claim={claim} />
            <DarwinHiddenLossDetective claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Timeline & History */}
          <ToolCategory
            title="Timeline & History"
            description="Visual claim history and audit trail"
            icon={<Clock className="h-4 w-4" />}
          >
            <VisualClaimTimeline claimId={claimId} claim={claim} />
            <ClaimTimeline claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Automation */}
          <ToolCategory
            title="Automation Settings"
            description="Configure AI-powered automations"
            icon={<Zap className="h-4 w-4" />}
          >
            <ClaimAutomationSettings claimId={claimId} />
          </ToolCategory>
        </div>

        {/* Copilot Chat Column */}
        {showCopilot && (
          <div className="order-1 lg:order-2 lg:sticky lg:top-4 lg:h-[calc(100vh-200px)]">
            <Card className="h-full flex flex-col border-primary/20">
              <CardHeader className="py-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  Darwin Copilot
                </CardTitle>
                <CardDescription className="text-xs">
                  Ask anything about this claim
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 p-4 min-h-[400px] lg:min-h-0 overflow-y-auto">
                <div className="text-center text-muted-foreground text-sm p-4">
                  <Brain className="h-8 w-8 mx-auto mb-2 text-primary/50" />
                  <p className="font-medium">Darwin Copilot</p>
                  <p className="text-xs mt-1">Use the AI Assistant button in the bottom right to chat with Darwin about this claim.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
