import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { Brain, ChevronDown, ChevronRight, Loader2, MessageSquare, FileText, Shield, Calculator, Zap, Search, Clock, Sparkles, TrendingUp, Swords, Building2, AlertCircle, Eye, Clipboard, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { subscribeCarrierDismantler } from "@/lib/darwinDismantlerBus";
import { subscribeDarwinKbDebug, type DarwinKbDebugEventDetail } from "@/lib/darwinKbDebugBus";

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
const DarwinEstimateComparison = lazy(() => import("@/components/claim-detail/DarwinEstimateComparison").then(m => ({ default: m.DarwinEstimateComparison })));
const DarwinDocumentTimeline = lazy(() => import("@/components/claim-detail/DarwinDocumentTimeline").then(m => ({ default: m.DarwinDocumentTimeline })));
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
  const [liveCarrierDismantler, setLiveCarrierDismantler] = useState<{
    analysisType: string;
    receivedAt: string;
    payload: any;
  } | null>(null);
  const [fallbackDismantler, setFallbackDismantler] = useState<{
    id: string;
    created_at: string;
    result: string | null;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [latestKbDebug, setLatestKbDebug] = useState<DarwinKbDebugEventDetail | null>(null);

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

    const fetchFallbackDismantler = async () => {
      const { data } = await supabase
        .from("darwin_analysis_results")
        .select("id, created_at, result, analysis_type")
        .eq("claim_id", claimId)
        .eq("analysis_type", "systematic_dismantling")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setFallbackDismantler({
          id: data[0].id,
          created_at: data[0].created_at,
          result: data[0].result as any,
        });
      }
    };

    fetchFallbackDismantler();

    const unsubscribe = subscribeCarrierDismantler((detail) => {
      if (detail.claimId !== claimId) return;
      setLiveCarrierDismantler({
        analysisType: detail.analysisType,
        receivedAt: new Date().toISOString(),
        payload: detail.carrierDismantler,
      });
    });

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
          if (newAnalysis.analysis_type === "systematic_dismantling") {
            setFallbackDismantler({
              id: newAnalysis.id,
              created_at: newAnalysis.created_at,
              result: newAnalysis.result,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      unsubscribe();
    };
  }, [claimId]);

  useEffect(() => {
    let mounted = true;

    const loadRole = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId || !mounted) return;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (!mounted) return;
      const admin = (roles || []).some((row) => row.role === "admin");
      setIsAdmin(admin);
    };

    loadRole();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDarwinKbDebug((detail) => {
      if (detail.claimId !== claimId) return;
      setLatestKbDebug(detail);
    });
    return () => unsubscribe();
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

  const dismantlerText: string | null = useMemo(() => {
    const live = liveCarrierDismantler?.payload;
    if (typeof live === "string") return live;
    if (live && typeof live === "object") {
      // if backend ever returns structured object, prefer a .text field
      if (typeof (live as any).text === "string") return (live as any).text;
      // fallback: stringify for display
      return JSON.stringify(live, null, 2);
    }
    return fallbackDismantler?.result ?? null;
  }, [liveCarrierDismantler, fallbackDismantler]);

  const parsedDismantler = useMemo(() => {
    const text = dismantlerText || "";
    const headings = [
      "Carrier Position Summary",
      "Key Weaknesses",
      "Evidence to Emphasize",
      "Risk and Overreach Checks",
      "Requested Resolution",
    ];

    const findIndex = (h: string) => {
      const re = new RegExp(`^\\s*(?:##\\s*)?${h}\\s*$`, "im");
      const m = text.match(re);
      if (!m?.index && m?.index !== 0) return -1;
      return m.index;
    };

    const starts = headings
      .map((h) => ({ h, i: findIndex(h) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i);

    const section = (h: string) => {
      const startObj = starts.find((s) => s.h === h);
      if (!startObj) return "";
      const start = startObj.i;
      const next = starts.find((s) => s.i > start)?.i ?? text.length;
      return text.slice(start, next).replace(/\r/g, "").trim();
    };

    const bulletsFromSection = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("-"))
        .map((l) => l.replace(/^-+\s*/, "").trim())
        .filter(Boolean);

    const numberedFromSection = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^\d+\.\s+/.test(l))
        .map((l) => l.replace(/^\d+\.\s+/, "").trim())
        .filter(Boolean);

    const evidenceLines = bulletsFromSection(section("Evidence to Emphasize"));
    const weaknesses = bulletsFromSection(section("Key Weaknesses"));
    const resolution = numberedFromSection(section("Requested Resolution"));

    const estimatedConfidence =
      evidenceLines.length === 0 ? 0.25 : evidenceLines.length < 2 ? 0.5 : 0.75;

    const missingDocs =
      evidenceLines.length === 0
        ? [
            "Declarations page",
            "Carrier estimate",
            "Denial/coverage letter",
            "Photos (damage + pre-loss if available)",
            "Engineer/contractor report (if causation disputed)",
          ]
        : [];

    return {
      estimatedConfidence,
      evidenceLines,
      weaknesses,
      resolution,
      missingDocs,
    };
  }, [dismantlerText]);

  const handleCopyFullDismantler = async () => {
    if (!dismantlerText) return;
    await navigator.clipboard.writeText(dismantlerText);
    toast.success("Dismantler output copied");
  };

  const handleCopyRequestedResolution = async () => {
    if (!parsedDismantler.resolution.length) return;
    const text = parsedDismantler.resolution.map((r, i) => `${i + 1}. ${r}`).join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Requested Resolution copied");
  };

  const handleCopyRequestDocsTemplate = async () => {
    const missing = parsedDismantler.missingDocs;
    const template = `Subject: Request for missing claim documentation\n\nHello,\n\nTo complete a defensible review and respond appropriately, please provide the following documents/information:\n${missing.map((d) => `- ${d}`).join("\n")}\n\nThank you,\n`;
    await navigator.clipboard.writeText(template);
    toast.success("Request docs template copied");
  };

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

      {isAdmin && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Darwin KB Retrieval Debug (Admin)
            </CardTitle>
            <CardDescription className="text-xs">
              Live retrieval health from latest darwin-ai-analysis response for this claim.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {!latestKbDebug ? (
              <p className="text-muted-foreground">
                No KB debug events captured yet. Run any Darwin analysis tool to populate this panel.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <span>
                    <strong>Analysis:</strong> {latestKbDebug.analysisType}
                  </span>
                  <span>
                    <strong>usedKb:</strong> {String(latestKbDebug.usedKb)}
                  </span>
                  <span>
                    <strong>At:</strong> {new Date(latestKbDebug.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {latestKbDebug.retrieval && (
                  <div className="space-y-1">
                    <div>
                      <strong>Retrieval:</strong>{" "}
                      pool={latestKbDebug.retrieval.pool}, topK={latestKbDebug.retrieval.topK}, perDocCap={latestKbDebug.retrieval.perDocCap}
                    </div>
                    {latestKbDebug.retrieval.queryExpansion && (
                      <div className="text-muted-foreground">
                        queryExpansion={latestKbDebug.retrieval.queryExpansion.totalQueries} queries
                        {latestKbDebug.retrieval.queryExpansion.queries?.length
                          ? ` (${latestKbDebug.retrieval.queryExpansion.queries.slice(0, 2).join(" | ")})`
                          : ""}
                      </div>
                    )}
                  </div>
                )}

                {latestKbDebug.retrieval?.health && (
                  <div className="rounded-md border border-border p-2 space-y-1">
                    <div>
                      <strong>Health:</strong>{" "}
                      processedDocs={latestKbDebug.retrieval.health.processedDocs}, docsMatchingFilters={latestKbDebug.retrieval.health.docsMatchingFilters}, chunksAvailable={latestKbDebug.retrieval.health.chunksAvailable}
                    </div>
                    <div className="text-muted-foreground">
                      chunksMatchingDocFilters={latestKbDebug.retrieval.health.chunksMatchingDocFilters}, docsWithZeroChunks={latestKbDebug.retrieval.health.docsWithZeroChunks}, poolCapped={String(latestKbDebug.retrieval.health.poolCapped)}
                    </div>
                  </div>
                )}

                {latestKbDebug.diagnosticHint && (
                  <Alert className="border-warning/50 bg-warning/10">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    <AlertTitle className="text-xs">Diagnostic hint</AlertTitle>
                    <AlertDescription className="text-xs">{latestKbDebug.diagnosticHint}</AlertDescription>
                  </Alert>
                )}

                {latestKbDebug.sources?.length > 0 && (
                  <div className="space-y-1">
                    <div><strong>Sources ({latestKbDebug.sources.length}):</strong></div>
                    <ul className="list-disc ml-4 text-muted-foreground">
                      {latestKbDebug.sources.slice(0, 3).map((source) => (
                        <li key={source.chunkId}>
                          {source.docTitle} (chunk: {source.chunkId}, score: {source.score})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Layout: Left rail + center tools + right drawer */}
      <div className="flex gap-6">
        {/* Left rail */}
        <div className="hidden lg:block w-56 flex-shrink-0">
          <Card className="border-border/50">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Sections
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => scrollToSection("rebuttals")}>
                <Shield className="h-4 w-4" />
                Rebuttals
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => scrollToSection("document-analysis")}>
                <FileText className="h-4 w-4" />
                Document Analysis
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => scrollToSection("timeline")}>
                <Clock className="h-4 w-4" />
                Timelines
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Center column */}
        <div className={cn("flex-1", showCopilot ? "min-w-0" : "")}>
          {/* Top context pills */}
          <div className="flex flex-wrap gap-2 pb-3">
            {claim?.insurance_company && (
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {claim.insurance_company}
              </span>
            )}
            {(claim?.policyholder_state || claim?.property_state) && (
              <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs">
                State: {claim.policyholder_state || claim.property_state}
              </span>
            )}
            {claim?.loss_type && (
              <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs">
                Loss: {claim.loss_type}
              </span>
            )}
          </div>

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
            <DarwinEstimateComparison claimId={claimId} claim={claim} />
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
            description="Visual claim history, document-based timeline, and audit trail"
            icon={<Clock className="h-4 w-4" />}
          >
            <div data-section="timeline" />
            <DarwinDocumentTimeline claimId={claimId} claim={claim} />
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
        </div>

        {/* Right drawer */}
        <div className="hidden xl:block w-96 flex-shrink-0">
          <Card className="h-full flex flex-col border-primary/20">
            <CardHeader className="py-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Dismantler Output
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Prefers fresh API output; falls back to latest saved result.
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={handleCopyFullDismantler} disabled={!dismantlerText}>
                    <Clipboard className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 p-3 overflow-y-auto space-y-3">
              {(!dismantlerText || dismantlerText.trim().length === 0) ? (
                <div className="text-xs text-muted-foreground">
                  No dismantler output yet. Run any Darwin analysis and it will be generated automatically.
                </div>
              ) : (
                <div className="space-y-3">
                  {(parsedDismantler.estimatedConfidence < 0.5 || parsedDismantler.evidenceLines.length === 0) && (
                    <Alert className="border-warning/50 bg-warning/10">
                      <AlertCircle className="h-4 w-4 text-warning" />
                      <AlertTitle>Needs more documentation to be fully defensible</AlertTitle>
                      <AlertDescription className="text-xs mt-1 space-y-2">
                        <div>
                          Missing docs to strengthen defensibility:
                          <ul className="list-disc ml-4 mt-1">
                            {parsedDismantler.missingDocs.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={handleCopyRequestDocsTemplate}>
                          <Send className="h-3 w-3" />
                          Copy request docs template
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Objections (Key Weaknesses) */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">Objections</div>
                    {parsedDismantler.weaknesses.length > 0 ? (
                      <div className="space-y-2">
                        {parsedDismantler.weaknesses.map((w, idx) => (
                          <Card key={idx} className="border-border/50">
                            <CardContent className="p-2 text-xs">
                              <div className="font-medium">Objection #{idx + 1}</div>
                              <div className="text-muted-foreground mt-1">{w}</div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No objections parsed.</div>
                    )}
                  </div>

                  {/* Evidence chips */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">Evidence</div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedDismantler.evidenceLines.length > 0 ? (
                        parsedDismantler.evidenceLines.map((e, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-[11px]"
                            title={e}
                          >
                            {e}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No evidence references parsed.</span>
                      )}
                    </div>
                  </div>

                  {/* Requested Resolution */}
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-muted-foreground">Requested Resolution</div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={handleCopyRequestedResolution}
                        disabled={parsedDismantler.resolution.length === 0}
                      >
                        <Clipboard className="h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                    {parsedDismantler.resolution.length > 0 ? (
                      <ol className="list-decimal ml-4 text-xs space-y-1">
                        {parsedDismantler.resolution.map((r, idx) => (
                          <li key={idx} className="text-muted-foreground">{r}</li>
                        ))}
                      </ol>
                    ) : (
                      <div className="text-xs text-muted-foreground">No requested resolution parsed.</div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
