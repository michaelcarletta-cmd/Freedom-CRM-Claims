import { useState, useEffect, lazy, Suspense } from "react";
import { Brain, ChevronDown, ChevronRight, Loader2, MessageSquare, FileText, Shield, Calculator, Zap, Search, Clock, Sparkles, TrendingUp, Swords, Building2, AlertCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Lazy load all Darwin components
const DarwinInsightsPanel = lazy(() => import("@/components/claim-detail/DarwinInsightsPanel").then(m => ({ default: m.DarwinInsightsPanel })));
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
const DarwinAutoDraftRebuttal = lazy(() => import("@/components/claim-detail/DarwinAutoDraftRebuttal").then(m => ({ default: m.DarwinAutoDraftRebuttal })));
const DarwinSystematicDismantler = lazy(() => import("@/components/claim-detail/DarwinSystematicDismantler").then(m => ({ default: m.DarwinSystematicDismantler })));
const DarwinAutoSummary = lazy(() => import("@/components/claim-detail/DarwinAutoSummary").then(m => ({ default: m.DarwinAutoSummary })));
const DarwinSmartDocumentSort = lazy(() => import("@/components/claim-detail/DarwinSmartDocumentSort").then(m => ({ default: m.DarwinSmartDocumentSort })));
const DarwinEstimateGapAnalysis = lazy(() => import("@/components/claim-detail/DarwinEstimateGapAnalysis").then(m => ({ default: m.DarwinEstimateGapAnalysis })));
const VisualClaimTimeline = lazy(() => import("@/components/claim-detail/VisualClaimTimeline").then(m => ({ default: m.VisualClaimTimeline })));
const DarwinComplianceChecker = lazy(() => import("@/components/claim-detail/DarwinComplianceChecker").then(m => ({ default: m.DarwinComplianceChecker })));
const DarwinDOBILetterDrafter = lazy(() => import("@/components/claim-detail/DarwinDOBILetterDrafter").then(m => ({ default: m.DarwinDOBILetterDrafter })));
const ClaimTimeline = lazy(() => import("@/components/claim-detail/ClaimTimeline").then(m => ({ default: m.ClaimTimeline })));
const ProofOfLossGenerator = lazy(() => import("@/components/claim-detail/ProofOfLossGenerator").then(m => ({ default: m.ProofOfLossGenerator })));
const ClaimContextPipeline = lazy(() => import("@/components/claim-detail/ClaimContextPipeline").then(m => ({ default: m.ClaimContextPipeline })));
const RecoverableDepreciationInvoice = lazy(() => import("@/components/claim-detail/RecoverableDepreciationInvoice").then(m => ({ default: m.RecoverableDepreciationInvoice })));
const ClaimAutomationSettings = lazy(() => import("@/components/claim-detail/ClaimAutomationSettings").then(m => ({ default: m.ClaimAutomationSettings })));
const ClaimAutonomySettings = lazy(() => import("@/components/claim-detail/ClaimAutonomySettings").then(m => ({ default: m.ClaimAutonomySettings })));
const DarwinButForCausation = lazy(() => import("@/components/claim-detail/DarwinButForCausation").then(m => ({ default: m.DarwinButForCausation })));
const DarwinProximityPrecedents = lazy(() => import("@/components/claim-detail/DarwinProximityPrecedents").then(m => ({ default: m.DarwinProximityPrecedents })));
const DarwinDeclaredPosition = lazy(() => import("@/components/claim-detail/DarwinDeclaredPosition").then(m => ({ default: m.DarwinDeclaredPosition })));

// New Strategic Components
const ClaimWarRoom = lazy(() => import("@/components/claim-detail/ClaimWarRoom").then(m => ({ default: m.ClaimWarRoom })));
const CarrierPlaybookDialog = lazy(() => import("@/components/claim-detail/CarrierPlaybookDialog").then(m => ({ default: m.CarrierPlaybookDialog })));
const DarwinSecondBrain = lazy(() => import("@/components/claim-detail/DarwinSecondBrain").then(m => ({ default: m.DarwinSecondBrain })));

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

// Map analysis types to readable names and scroll targets
const analysisTypeLabels: Record<string, { label: string; section: string }> = {
  denial_rebuttal: { label: 'Denial Rebuttal', section: 'rebuttals' },
  engineer_report_rebuttal: { label: 'Engineer Report Rebuttal', section: 'rebuttals' },
  estimate_gap_analysis: { label: 'Estimate Gap Analysis', section: 'document-analysis' },
  systematic_dismantling: { label: 'Systematic Dismantling', section: 'rebuttals' },
};

export const DarwinTab = ({ claimId, claim }: DarwinTabProps) => {
  const [showCopilot, setShowCopilot] = useState(true);
  const [autoAnalyses, setAutoAnalyses] = useState<Array<{ id: string; analysis_type: string; created_at: string; input_summary: string }>>([]);
  const [dismissedAnalyses, setDismissedAnalyses] = useState<Set<string>>(new Set());

  // Fetch recent auto-triggered analyses
  useEffect(() => {
    const fetchAutoAnalyses = async () => {
      const { data } = await supabase
        .from('darwin_analysis_results')
        .select('id, analysis_type, created_at, input_summary')
        .eq('claim_id', claimId)
        .in('analysis_type', ['denial_rebuttal', 'engineer_report_rebuttal', 'estimate_gap_analysis'])
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false })
        .limit(5);

      if (data) {
        setAutoAnalyses(data);
      }
    };

    fetchAutoAnalyses();

    // Subscribe to new analyses
    const channel = supabase
      .channel(`darwin_analyses_${claimId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'darwin_analysis_results',
          filter: `claim_id=eq.${claimId}`,
        },
        (payload) => {
          const newAnalysis = payload.new as any;
          if (['denial_rebuttal', 'engineer_report_rebuttal', 'estimate_gap_analysis'].includes(newAnalysis.analysis_type)) {
            setAutoAnalyses(prev => [newAnalysis, ...prev].slice(0, 5));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  const handleDismissAnalysis = (id: string) => {
    setDismissedAnalyses(prev => new Set([...prev, id]));
  };

  const scrollToSection = (section: string) => {
    // Find and open the relevant collapsible section
    const sectionElement = document.querySelector(`[data-section="${section}"]`);
    if (sectionElement) {
      sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const visibleAnalyses = autoAnalyses.filter(a => !dismissedAnalyses.has(a.id));

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

      {/* Auto-Analysis Ready Banner */}
      {visibleAnalyses.length > 0 && (
        <Alert className="border-primary/50 bg-primary/5">
          <Brain className="h-4 w-4 text-primary" />
          <AlertTitle className="flex items-center gap-2">
            Darwin Analysis Ready
            <span className="text-xs font-normal text-muted-foreground">
              ({visibleAnalyses.length} {visibleAnalyses.length === 1 ? 'analysis' : 'analyses'} completed)
            </span>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            {visibleAnalyses.map(analysis => {
              const typeInfo = analysisTypeLabels[analysis.analysis_type] || { label: analysis.analysis_type, section: '' };
              const timeAgo = new Date(analysis.created_at).toLocaleTimeString();
              
              return (
                <div key={analysis.id} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{typeInfo.label}</span>
                    {analysis.input_summary && (
                      <span className="text-xs text-muted-foreground ml-2 truncate">
                        {analysis.input_summary.substring(0, 50)}...
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">({timeAgo})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs gap-1"
                      onClick={() => scrollToSection(typeInfo.section)}
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleDismissAnalysis(analysis.id)}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              );
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Layout: Copilot + Tools */}
      <div className={cn("grid gap-6", showCopilot ? "lg:grid-cols-[1fr,400px]" : "grid-cols-1")}>
        {/* Tools Column */}
        <div className="space-y-4 order-2 lg:order-1">
          {/* Strategic Command Center - NEW */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Swords className="h-4 w-4 text-primary" />
                Strategic Command
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Suspense fallback={<LoadingFallback />}>
                <ClaimWarRoom claimId={claimId} claim={claim} />
                <CarrierPlaybookDialog 
                  carrierName={claim?.insurance_company} 
                  stateCode={claim?.property_state}
                />
              </Suspense>
            </CardContent>
          </Card>

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
                <ClaimContextPipeline claimId={claimId} claim={claim} />
              </Suspense>
            </CardContent>
          </Card>

          {/* Strategic Insights - NEW PRIMARY */}
          <Suspense fallback={<LoadingFallback />}>
            <DarwinInsightsPanel claimId={claimId} claim={claim} />
          </Suspense>

          {/* Claim Intelligence */}
          <ToolCategory
            title="Claim Intelligence"
            description="AI-powered insights, causation analysis, and recommendations"
            icon={<Search className="h-4 w-4" />}
            defaultOpen={false}
          >
            <DarwinButForCausation claimId={claimId} claim={claim} />
            <DarwinClaimBriefing claimId={claimId} claim={claim} />
            <DarwinNextSteps claimId={claimId} claim={claim} />
            <DarwinWeatherHistory claimId={claimId} claim={claim} />
            <DarwinWeaknessDetection claimId={claimId} claim={claim} />
          </ToolCategory>

          {/* Document Analysis */}
          <div data-section="document-analysis">
            <ToolCategory
              title="Document Analysis"
              description="Analyze and compare claim documents"
              icon={<FileText className="h-4 w-4" />}
              defaultOpen={autoAnalyses.some(a => a.analysis_type === 'estimate_gap_analysis')}
            >
            <DarwinEstimateGapAnalysis claimId={claimId} claim={claim} />
            <DarwinSmartExtraction claimId={claimId} claim={claim} />
            <DarwinDocumentComparison claimId={claimId} claim={claim} />
            <DarwinSmartDocumentSort claimId={claimId} claim={claim} />
            <DarwinPhotoLinker claimId={claimId} claim={claim} />
            </ToolCategory>
          </div>

          {/* Rebuttals & Responses */}
          <div data-section="rebuttals">
            <ToolCategory
              title="Rebuttals & Responses"
              description="Counter carrier denials and engineer reports"
              icon={<Shield className="h-4 w-4" />}
            >
            <Suspense fallback={<LoadingFallback />}>
              <DarwinDeclaredPosition claimId={claimId} claim={claim} />
            </Suspense>
            <DarwinProximityPrecedents claimId={claimId} claim={claim} />
            <DarwinSystematicDismantler claimId={claimId} claim={claim} />
            <DarwinAutoDraftRebuttal claimId={claimId} claim={claim} />
            <div className="grid gap-4 lg:grid-cols-2">
              <DarwinDenialAnalyzer claimId={claimId} claim={claim} />
              <DarwinEngineerReportAnalyzer claimId={claimId} claim={claim} />
            </div>
            <DarwinSupplementGenerator claimId={claimId} claim={claim} />
            <DarwinCorrespondenceAnalyzer claimId={claimId} claim={claim} />
            </ToolCategory>
          </div>

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
            <DarwinDOBILetterDrafter claimId={claimId} claim={claim} />
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
            description="Configure AI-powered automations and autonomous mode"
            icon={<Zap className="h-4 w-4" />}
            defaultOpen={true}
          >
            <ClaimAutonomySettings claimId={claimId} />
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
                  <p className="text-xs mt-1">Click the sparkle button in the bottom right corner to chat with Darwin about this claim.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
