import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Compass, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Target } from "lucide-react";

interface DarwinNextStepsProps {
  claimId: string;
  claim: any;
}

export const DarwinNextSteps = ({ claimId, claim }: DarwinNextStepsProps) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      // Fetch timeline data to provide context
      const [tasksResult, inspectionsResult, emailsResult, checksResult] = await Promise.all([
        supabase.from('tasks').select('*').eq('claim_id', claimId).order('due_date'),
        supabase.from('inspections').select('*').eq('claim_id', claimId),
        supabase.from('emails').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(5),
        supabase.from('claim_checks').select('*').eq('claim_id', claimId)
      ]);

      const timeline = {
        tasks: tasksResult.data || [],
        inspections: inspectionsResult.data || [],
        recentEmails: emailsResult.data || [],
        checksReceived: checksResult.data || []
      };

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'next_steps',
          additionalContext: { timeline }
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      setLastAnalyzed(new Date());
      toast({
        title: "Analysis complete",
        description: "Darwin has analyzed your claim and provided recommendations"
      });
    } catch (error: any) {
      console.error("Next steps analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze claim",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Extract priority sections from the analysis
  const renderAnalysis = () => {
    if (!analysis) return null;

    return (
      <ScrollArea className="h-[500px] border rounded-md p-4 bg-muted/30">
        <pre className="whitespace-pre-wrap text-sm">{analysis}</pre>
      </ScrollArea>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          Next Step Predictor
        </CardTitle>
        <CardDescription>
          AI-powered analysis of optimal next actions based on claim status, timeline, and industry knowledge
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {lastAnalyzed 
                ? `Last analyzed: ${lastAnalyzed.toLocaleString()}`
                : "Click analyze to get AI recommendations"
              }
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {analysis ? "Refresh Analysis" : "Analyze Claim"}
              </>
            )}
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-primary">{claim.status || 'N/A'}</div>
            <div className="text-xs text-muted-foreground">Current Status</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold">{claim.loss_date ? Math.floor((Date.now() - new Date(claim.loss_date).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'}</div>
            <div className="text-xs text-muted-foreground">Days Since Loss</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold">{claim.created_at ? Math.floor((Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'}</div>
            <div className="text-xs text-muted-foreground">Days Open</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold">${claim.claim_amount?.toLocaleString() || 'TBD'}</div>
            <div className="text-xs text-muted-foreground">Claim Amount</div>
          </div>
        </div>

        {analysis && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              AI Recommendations
            </h4>
            {renderAnalysis()}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
