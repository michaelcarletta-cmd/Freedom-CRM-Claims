import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Loader2, Copy, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DarwinEstimateGapAnalysisProps {
  claimId: string;
  claim: any;
}

export const DarwinEstimateGapAnalysis = ({ claimId, claim }: DarwinEstimateGapAnalysisProps) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const { toast } = useToast();

  // Load previous analysis on mount
  useEffect(() => {
    loadPreviousAnalysis();
  }, [claimId]);

  const loadPreviousAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('darwin_analysis_results')
        .select('*')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'estimate_gap_analysis')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setAnalysis(data.result);
        setLastAnalyzed(new Date(data.created_at));
        setLastFileName(data.pdf_file_name || data.input_summary || null);
      }
    } catch (err) {
      // No analysis found is okay
      console.log('No previous estimate gap analysis found');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (analysis) {
      await navigator.clipboard.writeText(analysis);
      toast({
        title: "Copied",
        description: "Gap analysis copied to clipboard"
      });
    }
  };

  const formatAnalysisContent = (content: string) => {
    // Highlight key sections
    const sections = [
      { pattern: /## ESTIMATE SUMMARY/gi, icon: '📊' },
      { pattern: /## MISSING LINE ITEMS/gi, icon: '🔍' },
      { pattern: /## QUANTITY CONCERNS/gi, icon: '⚠️' },
      { pattern: /## SUPPLEMENT OPPORTUNITIES/gi, icon: '💰' },
      { pattern: /## AMBIGUOUS LANGUAGE/gi, icon: '📝' },
      { pattern: /## RECOMMENDED ACTIONS/gi, icon: '✅' },
    ];

    let formatted = content;
    sections.forEach(({ pattern, icon }) => {
      formatted = formatted.replace(pattern, (match) => `${icon} ${match}`);
    });

    return formatted;
  };

  if (loading && !analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Estimate Gap Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Loading analysis...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Estimate Gap Analysis
              {analysis && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Ready
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {analysis 
                ? "AI-identified gaps, missing items, and supplement opportunities"
                : "Upload or classify an estimate to auto-generate gap analysis"
              }
            </CardDescription>
          </div>
          {analysis && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadPreviousAnalysis}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {analysis ? (
          <div className="space-y-3">
            {lastFileName && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Source: {lastFileName}</span>
                {lastAnalyzed && (
                  <span>• Analyzed: {lastAnalyzed.toLocaleString()}</span>
                )}
              </div>
            )}
            <Alert className="bg-warning/10 border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning-foreground text-sm">
                Review these findings to identify supplement opportunities before accepting the carrier's estimate.
              </AlertDescription>
            </Alert>
            <ScrollArea className="h-[400px] border rounded-md">
              <pre className="p-4 text-sm whitespace-pre-wrap font-mono bg-muted/30">
                {formatAnalysisContent(analysis)}
              </pre>
            </ScrollArea>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No estimate gap analysis available yet.</p>
            <p className="text-xs mt-1">
              When Darwin detects and classifies an estimate, it will automatically analyze for gaps.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DarwinEstimateGapAnalysis;
