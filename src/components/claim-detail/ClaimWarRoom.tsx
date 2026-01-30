import { useState, useEffect, lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Swords, 
  Clock, 
  Shield, 
  FileText, 
  Zap, 
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  Calendar,
  DollarSign,
  Building2
} from "lucide-react";
import { format, differenceInDays } from "date-fns";

const CausalityTimeline = lazy(() => import("./CausalityTimeline").then(m => ({ default: m.CausalityTimeline })));
const EvidenceArsenal = lazy(() => import("./EvidenceArsenal").then(m => ({ default: m.EvidenceArsenal })));
const CarrierBehaviorProfile = lazy(() => import("./CarrierBehaviorProfile").then(m => ({ default: m.CarrierBehaviorProfile })));

interface ClaimWarRoomProps {
  claimId: string;
  claim: any;
}

interface StrategicInsights {
  overall_health_score: number | null;
  coverage_strength_score: number | null;
  evidence_quality_score: number | null;
  leverage_score: number | null;
  timeline_risk_score: number | null;
  warnings: any[];
  leverage_points: any[];
  coverage_triggers_detected: any[];
  evidence_gaps: any[];
  recommended_next_moves: any[];
  senior_pa_opinion: string | null;
  matched_playbooks?: any[];
}

export const ClaimWarRoom = ({ claimId, claim }: ClaimWarRoomProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [insights, setInsights] = useState<StrategicInsights | null>(null);
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadWarRoomData();
    }
  }, [isOpen, claimId]);

  const loadWarRoomData = async () => {
    setLoading(true);
    try {
      const [insightsResult, deadlinesResult] = await Promise.all([
        supabase.from('claim_strategic_insights').select('*').eq('claim_id', claimId).single(),
        supabase.from('claim_carrier_deadlines').select('*').eq('claim_id', claimId).order('deadline_date', { ascending: true })
      ]);

      if (insightsResult.data) {
        setInsights(insightsResult.data as unknown as StrategicInsights);
      }
      if (deadlinesResult.data) {
        setDeadlines(deadlinesResult.data);
      }
    } catch (error) {
      console.error("Error loading war room data:", error);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('darwin-strategic-intelligence', {
        body: { claimId, analysisType: 'full_strategic_analysis' }
      });

      if (error) throw error;

      toast({ title: "Analysis Complete", description: "War Room data has been updated" });
      await loadWarRoomData();
    } catch (error: any) {
      toast({ title: "Analysis Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'bg-muted';
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreTextColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 75) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Calculate strategic metrics
  const daysOpen = claim?.created_at ? differenceInDays(new Date(), new Date(claim.created_at)) : 0;
  const overdueDeadlines = deadlines.filter(d => d.days_overdue && d.days_overdue > 0);
  const badFaithIndicators = deadlines.filter(d => d.bad_faith_potential);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-primary/50 hover:bg-primary/10">
          <Swords className="h-4 w-4 text-primary" />
          War Room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-7xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Swords className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Claim War Room</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {claim?.claim_number} • Strategic Command Center
                </p>
              </div>
            </div>
            <Button onClick={runAnalysis} disabled={loading} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              {insights ? "Refresh Analysis" : "Run Analysis"}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="p-6 space-y-6">
            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
                <CardContent className="p-4 text-center">
                  <div className={`text-3xl font-bold ${getScoreTextColor(insights?.overall_health_score)}`}>
                    {insights?.overall_health_score ?? '--'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Health Score</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold">{daysOpen}</div>
                  <div className="text-xs text-muted-foreground mt-1">Days Open</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-red-600">{overdueDeadlines.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Overdue Deadlines</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-orange-600">{badFaithIndicators.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Bad Faith Flags</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{insights?.leverage_points?.length ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Leverage Points</div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content - 4 Quadrant Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Q1: Causality Timeline */}
              <Card className="border-2">
                <CardHeader className="py-3 px-4 bg-muted/30">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    Causality Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 min-h-[300px]">
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                    <CausalityTimeline claimId={claimId} claim={claim} deadlines={deadlines} />
                  </Suspense>
                </CardContent>
              </Card>

              {/* Q2: Strategic Position */}
              <Card className="border-2">
                <CardHeader className="py-3 px-4 bg-muted/30">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    Strategic Position
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 min-h-[300px]">
                  {insights ? (
                    <div className="space-y-4">
                      {/* Score Bars */}
                      <div className="space-y-3">
                        <ScoreBar label="Coverage Strength" score={insights.coverage_strength_score} />
                        <ScoreBar label="Evidence Quality" score={insights.evidence_quality_score} />
                        <ScoreBar label="Leverage" score={insights.leverage_score} />
                        <ScoreBar label="Timeline Risk" score={insights.timeline_risk_score} />
                      </div>

                      {/* Leverage Points */}
                      {Array.isArray(insights.leverage_points) && insights.leverage_points.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3 text-green-600" />
                            Leverage Points
                          </h4>
                          <div className="space-y-1">
                            {insights.leverage_points.slice(0, 3).map((point: any, i: number) => (
                              <div key={i} className="text-xs p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-800">
                                {typeof point === 'string' ? point : point.title || point.description}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Risk Indicators */}
                      {Array.isArray(insights.warnings) && insights.warnings.filter((w: any) => w.severity === 'critical' || w.severity === 'high').length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-red-600" />
                            Risk Indicators
                          </h4>
                          <div className="space-y-1">
                            {insights.warnings.filter((w: any) => w.severity === 'critical' || w.severity === 'high').slice(0, 3).map((warning: any, i: number) => (
                              <div key={i} className="text-xs p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800">
                                {warning.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      Run analysis to see strategic position
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Q3: Evidence Arsenal */}
              <Card className="border-2">
                <CardHeader className="py-3 px-4 bg-muted/30">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-600" />
                    Evidence Arsenal
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 min-h-[300px]">
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                    <EvidenceArsenal claimId={claimId} insights={insights} />
                  </Suspense>
                </CardContent>
              </Card>

              {/* Q4: Battle Playbook */}
              <Card className="border-2">
                <CardHeader className="py-3 px-4 bg-muted/30">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-orange-600" />
                    Battle Playbook
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 min-h-[300px]">
                  {insights ? (
                    <div className="space-y-4">
                      {/* Matched Carrier Playbooks */}
                      {Array.isArray(insights.matched_playbooks) && insights.matched_playbooks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-orange-600" />
                            Carrier-Specific Tactics ({claim?.insurance_company})
                          </h4>
                          <div className="space-y-2">
                            {insights.matched_playbooks.slice(0, 3).map((playbook: any, i: number) => (
                              <div key={i} className="text-xs p-2 bg-orange-50 dark:bg-orange-950/30 rounded border border-orange-200 dark:border-orange-800">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold capitalize text-orange-700 dark:text-orange-300">
                                    {playbook.action_type}
                                  </span>
                                  {playbook.success_rate && (
                                    <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 rounded">
                                      {playbook.success_rate}% success
                                    </span>
                                  )}
                                </div>
                                <p className="text-muted-foreground">{playbook.recommended_action}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Next Moves */}
                      {Array.isArray(insights.recommended_next_moves) && insights.recommended_next_moves.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                            <Zap className="h-3 w-3 text-primary" />
                            Recommended Moves
                          </h4>
                          <div className="space-y-2">
                            {insights.recommended_next_moves.slice(0, 4).map((move: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs p-2 bg-primary/5 rounded border border-primary/20">
                                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">
                                  {i + 1}
                                </div>
                                <span>{typeof move === 'string' ? move : move.action || move.title || move.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Coverage Triggers */}
                      {Array.isArray(insights.coverage_triggers_detected) && insights.coverage_triggers_detected.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                            <Target className="h-3 w-3 text-blue-600" />
                            Coverage Triggers
                          </h4>
                          <div className="space-y-1">
                            {insights.coverage_triggers_detected.slice(0, 2).map((trigger: any, i: number) => (
                              <div key={i} className="text-xs p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
                                <span className="font-medium text-blue-600">IF</span> {trigger.trigger || trigger.condition}
                                <ArrowRight className="inline h-3 w-3 mx-1" />
                                <span className="font-medium text-green-600">THEN</span> {trigger.coverage_opportunity || trigger.opportunity}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Carrier Intelligence (Fallback if no matched playbooks) */}
                      {(!insights.matched_playbooks || insights.matched_playbooks.length === 0) && (
                        <div className="mt-4">
                          <Suspense fallback={null}>
                            <CarrierBehaviorProfile carrierName={claim?.insurance_company} compact />
                          </Suspense>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      Run analysis to see battle playbook
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Senior PA Opinion */}
            {insights?.senior_pa_opinion && (
              <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Senior PA Strategic Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-sm italic text-muted-foreground leading-relaxed">
                    "{insights.senior_pa_opinion}"
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Score Bar Component
const ScoreBar = ({ label, score }: { label: string; score: number | null }) => {
  const getColor = () => {
    if (!score) return 'bg-muted';
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score ?? '--'}</span>
      </div>
      <Progress value={score ?? 0} className={`h-2 ${getColor()}`} />
    </div>
  );
};
