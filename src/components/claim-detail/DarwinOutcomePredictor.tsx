import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  TrendingUp, Loader2, RefreshCw, DollarSign, Clock, 
  AlertTriangle, CheckCircle, Target, BarChart3, History
} from "lucide-react";
import { format } from "date-fns";

interface DarwinOutcomePredictorProps {
  claimId: string;
  claim: any;
}

interface OutcomePrediction {
  id: string;
  predicted_settlement_low: number | null;
  predicted_settlement_high: number | null;
  predicted_settlement_likely: number | null;
  settlement_probability: number;
  predicted_timeline_days: number | null;
  risk_factors: any[];
  opportunity_factors: any[];
  comparable_claims: any[];
  analysis_notes: string | null;
  created_at: string;
}

export const DarwinOutcomePredictor = ({ claimId, claim }: DarwinOutcomePredictorProps) => {
  const [prediction, setPrediction] = useState<OutcomePrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    loadPrediction();
  }, [claimId]);

  const loadPrediction = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('claim_outcome_predictions')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const parseJsonArray = (val: unknown): any[] => {
          if (Array.isArray(val)) return val;
          if (typeof val === 'string') {
            try { return JSON.parse(val); } catch { return []; }
          }
          return [];
        };
        
        setPrediction({
          ...data,
          risk_factors: parseJsonArray(data.risk_factors),
          opportunity_factors: parseJsonArray(data.opportunity_factors),
          comparable_claims: parseJsonArray(data.comparable_claims)
        });
      }
    } catch (error) {
      console.error('Error loading prediction:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const generatePrediction = async () => {
    setLoading(true);
    toast.info('Analyzing claim data to predict outcomes...');

    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'outcome_prediction'
        }
      });

      if (error) throw error;

      const pred = data.prediction || {};
      const { data: userData } = await supabase.auth.getUser();

      const { data: savedPrediction, error: saveError } = await supabase
        .from('claim_outcome_predictions')
        .insert({
          claim_id: claimId,
          predicted_settlement_low: pred.settlement_low,
          predicted_settlement_high: pred.settlement_high,
          predicted_settlement_likely: pred.settlement_likely,
          settlement_probability: pred.probability || 0.75,
          predicted_timeline_days: pred.timeline_days,
          risk_factors: pred.risks || [],
          opportunity_factors: pred.opportunities || [],
          comparable_claims: pred.comparables || [],
          analysis_notes: pred.notes,
          created_by: userData.user?.id
        })
        .select()
        .single();

      if (saveError) throw saveError;

      const parseJsonArray = (val: unknown): any[] => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return []; }
        }
        return [];
      };

      setPrediction({
        ...savedPrediction,
        risk_factors: parseJsonArray(savedPrediction.risk_factors),
        opportunity_factors: parseJsonArray(savedPrediction.opportunity_factors),
        comparable_claims: parseJsonArray(savedPrediction.comparable_claims)
      });

      toast.success('Outcome prediction generated');
    } catch (error: any) {
      console.error('Error generating prediction:', error);
      toast.error(error.message || 'Failed to generate prediction');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return 'N/A';
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Outcome Predictor
            </CardTitle>
            <CardDescription>
              AI-powered settlement and timeline predictions based on claim characteristics
            </CardDescription>
          </div>
          <Button onClick={generatePrediction} disabled={loading} size="sm">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {prediction ? 'Refresh' : 'Predict'}
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadingData ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading predictions...</p>
          </div>
        ) : !prediction ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30">
            <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No prediction generated yet</p>
            <Button variant="outline" onClick={generatePrediction} disabled={loading}>
              Generate Outcome Prediction
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Last Updated */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <History className="h-3 w-3" />
              Last predicted: {format(new Date(prediction.created_at), 'MMM d, yyyy h:mm a')}
            </div>

            {/* Settlement Range */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-green-600" />
                Predicted Settlement Range
              </h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Low</p>
                  <p className="text-lg font-semibold text-muted-foreground">
                    {formatCurrency(prediction.predicted_settlement_low)}
                  </p>
                </div>
                <div className="border-x px-4">
                  <p className="text-xs text-muted-foreground">Most Likely</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(prediction.predicted_settlement_likely)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">High</p>
                  <p className="text-lg font-semibold text-green-600">
                    {formatCurrency(prediction.predicted_settlement_high)}
                  </p>
                </div>
              </div>
              
              {/* Probability */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Settlement Probability</span>
                  <span className="font-medium">
                    {Math.round(prediction.settlement_probability * 100)}%
                  </span>
                </div>
                <Progress value={prediction.settlement_probability * 100} className="h-2" />
              </div>
            </div>

            {/* Timeline */}
            {prediction.predicted_timeline_days && (
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  Predicted Timeline
                </h4>
                <p className="text-2xl font-bold">
                  ~{prediction.predicted_timeline_days} days
                </p>
                <p className="text-xs text-muted-foreground">
                  Estimated time to resolution from current status
                </p>
              </div>
            )}

            {/* Risk & Opportunity Factors */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Risks */}
              <div className="p-4 border rounded-lg border-destructive/30 bg-destructive/5">
                <h4 className="font-medium flex items-center gap-2 mb-3 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Risk Factors ({prediction.risk_factors?.length || 0})
                </h4>
                <ScrollArea className="h-[120px]">
                  {prediction.risk_factors?.length > 0 ? (
                    <ul className="space-y-2">
                      {prediction.risk_factors.map((risk: any, i: number) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-destructive">•</span>
                          <span>{typeof risk === 'string' ? risk : risk.description || risk.factor}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No major risks identified</p>
                  )}
                </ScrollArea>
              </div>

              {/* Opportunities */}
              <div className="p-4 border rounded-lg border-green-600/30 bg-green-600/5">
                <h4 className="font-medium flex items-center gap-2 mb-3 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Opportunities ({prediction.opportunity_factors?.length || 0})
                </h4>
                <ScrollArea className="h-[120px]">
                  {prediction.opportunity_factors?.length > 0 ? (
                    <ul className="space-y-2">
                      {prediction.opportunity_factors.map((opp: any, i: number) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-green-600">•</span>
                          <span>{typeof opp === 'string' ? opp : opp.description || opp.factor}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Analyzing opportunities...</p>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Analysis Notes */}
            {prediction.analysis_notes && (
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4" />
                  Analysis Summary
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {prediction.analysis_notes}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
