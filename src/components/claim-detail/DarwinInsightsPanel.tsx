import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  RefreshCw, 
  Loader2, 
  AlertTriangle, 
  Target, 
  Shield, 
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Zap,
  FileSearch,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lightbulb,
  ArrowRight
} from "lucide-react";

interface DarwinInsightsPanelProps {
  claimId: string;
  claim: any;
}

interface StrategicInsights {
  id: string;
  claim_id: string;
  coverage_strength_score: number | null;
  evidence_quality_score: number | null;
  leverage_score: number | null;
  timeline_risk_score: number | null;
  overall_health_score: number | null;
  warnings: any[];
  leverage_points: any[];
  coverage_triggers_detected: any[];
  evidence_gaps: any[];
  recommended_next_moves: any[];
  senior_pa_opinion: string | null;
  last_analyzed_at: string | null;
}

export const DarwinInsightsPanel = ({ claimId, claim }: DarwinInsightsPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState({
    warnings: true,
    leverage: false,
    coverage: false,
    evidence: false,
    nextMoves: true,
    paOpinion: false
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use React Query for insights with automatic refetching
  const { data: insights, refetch: refetchInsights } = useQuery({
    queryKey: ['darwin-insights', claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claim_strategic_insights')
        .select('*')
        .eq('claim_id', claimId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching insights:', error);
      }
      return data as StrategicInsights | null;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Subscribe to claim data changes to trigger re-analysis prompt
  useEffect(() => {
    // Subscribe to multiple tables that affect Darwin analysis
    const channels = [
      supabase.channel(`claim-files-${claimId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'claim_files', filter: `claim_id=eq.${claimId}` }, () => {
          queryClient.invalidateQueries({ queryKey: ['darwin-insights', claimId] });
        }),
      supabase.channel(`claim-photos-${claimId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'claim_photos', filter: `claim_id=eq.${claimId}` }, () => {
          queryClient.invalidateQueries({ queryKey: ['darwin-insights', claimId] });
        }),
      supabase.channel(`claim-checks-${claimId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'claim_checks', filter: `claim_id=eq.${claimId}` }, () => {
          queryClient.invalidateQueries({ queryKey: ['darwin-insights', claimId] });
        }),
      supabase.channel(`emails-${claimId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'emails', filter: `claim_id=eq.${claimId}` }, () => {
          queryClient.invalidateQueries({ queryKey: ['darwin-insights', claimId] });
        }),
    ];

    channels.forEach(channel => channel.subscribe());

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [claimId, queryClient]);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('darwin-strategic-intelligence', {
        body: {
          claimId,
          analysisType: 'full_strategic_analysis'
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Strategic Analysis Complete",
        description: "Darwin has analyzed your claim and generated insights"
      });

      // Reload insights from database using React Query
      await refetchInsights();

    } catch (error: any) {
      console.error("Strategic analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze claim",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 75) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreGradient = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 75) return "bg-gradient-to-r from-green-500 to-green-600";
    if (score >= 50) return "bg-gradient-to-r from-yellow-500 to-yellow-600";
    return "bg-gradient-to-r from-red-500 to-red-600";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      default: return 'bg-blue-500 text-white';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return <XCircle className="h-4 w-4" />;
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'medium': return <AlertCircle className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const formatTimeSince = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Darwin Strategic Insights
            </CardTitle>
            <CardDescription>
              AI-powered strategic analysis with opinions, leverage points, and recommendations
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {insights?.last_analyzed_at && (
              <span className="text-xs text-muted-foreground">
                Updated {formatTimeSince(insights.last_analyzed_at)}
              </span>
            )}
            <Button onClick={runAnalysis} disabled={loading} size="sm">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {insights ? "Refresh" : "Analyze"}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!insights && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Click "Analyze" to generate strategic insights</p>
            <p className="text-sm mt-1">Darwin will evaluate coverage, evidence, and recommend next moves</p>
          </div>
        )}

        {insights && (
          <>
            {/* Health Score Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <ScoreCard 
                label="Overall" 
                score={insights.overall_health_score} 
                icon={<Shield className="h-4 w-4" />}
                primary
              />
              <ScoreCard 
                label="Coverage" 
                score={insights.coverage_strength_score} 
                icon={<Target className="h-4 w-4" />}
              />
              <ScoreCard 
                label="Evidence" 
                score={insights.evidence_quality_score} 
                icon={<FileSearch className="h-4 w-4" />}
              />
              <ScoreCard 
                label="Leverage" 
                score={insights.leverage_score} 
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <ScoreCard 
                label="Timeline" 
                score={insights.timeline_risk_score} 
                icon={<Clock className="h-4 w-4" />}
              />
            </div>

            {/* Warnings Section */}
            {Array.isArray(insights.warnings) && insights.warnings.length > 0 && (
              <InsightSection
                title="Active Warnings"
                icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
                count={insights.warnings.length}
                isOpen={sectionsOpen.warnings}
                onToggle={() => toggleSection('warnings')}
                badge={<Badge variant="destructive" className="text-xs">{insights.warnings.filter(w => w.severity === 'critical' || w.severity === 'high').length} urgent</Badge>}
              >
                <div className="space-y-2">
                  {insights.warnings.map((warning: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                      <div className={`p-1.5 rounded ${getSeverityColor(warning.severity)}`}>
                        {getSeverityIcon(warning.severity)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{warning.title}</span>
                          <Badge variant="outline" className="text-xs">{warning.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{warning.message}</p>
                        {warning.suggested_action && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                            <ArrowRight className="h-3 w-3" />
                            <span>{warning.suggested_action}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </InsightSection>
            )}

            {/* Recommended Next Moves */}
            {Array.isArray(insights.recommended_next_moves) && insights.recommended_next_moves.length > 0 && (
              <InsightSection
                title="Recommended Next Moves"
                icon={<Zap className="h-4 w-4 text-primary" />}
                count={insights.recommended_next_moves.length}
                isOpen={sectionsOpen.nextMoves}
                onToggle={() => toggleSection('nextMoves')}
              >
                <div className="space-y-2">
                  {insights.recommended_next_moves.map((move: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium text-sm">
                          {typeof move === 'string' ? move : move.action || move.title || move.description}
                        </span>
                        {move.timing && (
                          <Badge variant="outline" className="ml-2 text-xs">{move.timing}</Badge>
                        )}
                        {move.reason && (
                          <p className="text-xs text-muted-foreground mt-1">{move.reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </InsightSection>
            )}

            {/* Leverage Opportunities */}
            {Array.isArray(insights.leverage_points) && insights.leverage_points.length > 0 && (
              <InsightSection
                title="Leverage Opportunities"
                icon={<TrendingUp className="h-4 w-4 text-green-600" />}
                count={insights.leverage_points.length}
                isOpen={sectionsOpen.leverage}
                onToggle={() => toggleSection('leverage')}
              >
                <div className="space-y-2">
                  {insights.leverage_points.map((point: any, i: number) => (
                    <div key={i} className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="font-medium text-sm text-green-800 dark:text-green-200">
                        {typeof point === 'string' ? point : point.title || point.type || point.description}
                      </div>
                      {point.explanation && (
                        <p className="text-xs text-green-700 dark:text-green-300 mt-1">{point.explanation}</p>
                      )}
                      {point.how_to_use && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                          <ArrowRight className="h-3 w-3" />
                          <span>{point.how_to_use}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </InsightSection>
            )}

            {/* Coverage Triggers */}
            {Array.isArray(insights.coverage_triggers_detected) && insights.coverage_triggers_detected.length > 0 && (
              <InsightSection
                title="Coverage Triggers Detected"
                icon={<Target className="h-4 w-4 text-blue-600" />}
                count={insights.coverage_triggers_detected.length}
                isOpen={sectionsOpen.coverage}
                onToggle={() => toggleSection('coverage')}
                badge={<Badge className="bg-blue-500 text-xs">If/Then Opportunities</Badge>}
              >
                <div className="space-y-2">
                  {insights.coverage_triggers_detected.map((trigger: any, i: number) => (
                    <div key={i} className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-blue-600 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded">IF</span>
                        <span className="text-sm">{trigger.trigger || trigger.condition}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded">THEN</span>
                        <span className="text-sm font-medium">{trigger.coverage_opportunity || trigger.opportunity}</span>
                      </div>
                      {trigger.action_required && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-blue-600">
                          <ArrowRight className="h-3 w-3" />
                          <span>{trigger.action_required}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </InsightSection>
            )}

            {/* Evidence Gaps */}
            {Array.isArray(insights.evidence_gaps) && insights.evidence_gaps.length > 0 && (
              <InsightSection
                title="Evidence Gaps"
                icon={<FileSearch className="h-4 w-4 text-yellow-600" />}
                count={insights.evidence_gaps.length}
                isOpen={sectionsOpen.evidence}
                onToggle={() => toggleSection('evidence')}
              >
                <div className="space-y-2">
                  {insights.evidence_gaps.map((gap: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div>
                        <span className="text-sm">{typeof gap === 'string' ? gap : gap.description || gap.item}</span>
                        {gap.recommendation && (
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">{gap.recommendation}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </InsightSection>
            )}

            {/* Senior PA Opinion */}
            {insights.senior_pa_opinion && (
              <InsightSection
                title="Senior PA Opinion"
                icon={<Brain className="h-4 w-4 text-purple-600" />}
                isOpen={sectionsOpen.paOpinion}
                onToggle={() => toggleSection('paOpinion')}
                badge={<Badge className="bg-purple-500 text-xs">Expert View</Badge>}
              >
                <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-sm italic text-purple-800 dark:text-purple-200 whitespace-pre-wrap">
                    "{insights.senior_pa_opinion}"
                  </p>
                </div>
              </InsightSection>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Score Card Component
const ScoreCard = ({ 
  label, 
  score, 
  icon, 
  primary = false 
}: { 
  label: string; 
  score: number | null; 
  icon: React.ReactNode;
  primary?: boolean;
}) => {
  const getColor = () => {
    if (!score) return 'text-muted-foreground';
    if (score >= 75) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBgColor = () => {
    if (!score) return 'bg-muted/50';
    if (score >= 75) return 'bg-green-50 dark:bg-green-950/30';
    if (score >= 50) return 'bg-yellow-50 dark:bg-yellow-950/30';
    return 'bg-red-50 dark:bg-red-950/30';
  };

  return (
    <div className={`p-3 rounded-lg text-center ${primary ? 'bg-primary/10 border-2 border-primary/30' : getBgColor()}`}>
      <div className={`flex items-center justify-center gap-1 mb-1 ${getColor()}`}>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${getColor()}`}>
        {score ?? '—'}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
};

// Collapsible Section Component
const InsightSection = ({
  title,
  icon,
  count,
  isOpen,
  onToggle,
  badge,
  children
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-3 h-auto hover:bg-muted/50">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium">{title}</span>
            {count !== undefined && (
              <Badge variant="secondary" className="text-xs">{count}</Badge>
            )}
            {badge}
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};
