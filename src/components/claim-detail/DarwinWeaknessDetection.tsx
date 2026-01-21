import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Loader2, Copy, Download, Sparkles, History, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DarwinWeaknessDetectionProps {
  claimId: string;
  claim: any;
}

interface Weakness {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  issue: string;
  recommendation: string;
}

export const DarwinWeaknessDetection = ({ claimId, claim }: DarwinWeaknessDetectionProps) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  const { toast } = useToast();

  // Load previous analysis on mount
  useEffect(() => {
    const loadPreviousAnalysis = async () => {
      const { data } = await supabase
        .from('darwin_analysis_results')
        .select('*')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'weakness_detection')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setAnalysis(data.result);
        setLastAnalyzed(new Date(data.created_at));
        // Try to parse structured weaknesses from the result
        try {
          const parsed = JSON.parse(data.result);
          if (parsed.weaknesses) {
            setWeaknesses(parsed.weaknesses);
          }
        } catch {
          // Result is plain text, not JSON
        }
      }
    };

    loadPreviousAnalysis();
  }, [claimId]);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'weakness_detection'
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      setLastAnalyzed(new Date());
      
      // Try to parse structured weaknesses
      if (data.weaknesses) {
        setWeaknesses(data.weaknesses);
      }

      // Save the analysis result
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('darwin_analysis_results').insert({
        claim_id: claimId,
        analysis_type: 'weakness_detection',
        input_summary: 'Full claim package review',
        result: typeof data.result === 'string' ? data.result : JSON.stringify(data),
        created_by: userData.user?.id
      });

      toast({
        title: "Analysis complete",
        description: "Darwin has reviewed your claim package for weaknesses"
      });
    } catch (error: any) {
      console.error("Weakness detection error:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze claim for weaknesses",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (analysis) {
      navigator.clipboard.writeText(analysis);
      toast({ title: "Copied", description: "Analysis copied to clipboard" });
    }
  };

  const downloadAsText = () => {
    if (analysis) {
      const blob = new Blob([analysis], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weakness-analysis-${claim.claim_number || claimId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'default';
      case 'medium':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          Claim Weakness Detection
        </CardTitle>
        <CardDescription>
          Darwin reviews your entire claim package and identifies gaps, missing documentation, or weak points before the carrier does
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastAnalyzed && (
          <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Last reviewed {lastAnalyzed.toLocaleString()}
          </div>
        )}

        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
          <p className="text-sm">
            <strong>What Darwin will check:</strong>
          </p>
          <ul className="text-sm mt-2 space-y-1 text-muted-foreground">
            <li>• Missing or incomplete documentation</li>
            <li>• Gaps in damage evidence</li>
            <li>• Timeline inconsistencies</li>
            <li>• Weak legal or policy arguments</li>
            <li>• Potential carrier counterarguments</li>
            <li>• Missing photos or inspection areas</li>
            <li>• Estimate line items that may be challenged</li>
          </ul>
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing Claim Package...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Detect Weaknesses
            </>
          )}
        </Button>

        {/* Structured Weaknesses Display */}
        {weaknesses.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Identified Issues ({weaknesses.length})</h4>
              <div className="flex gap-1">
                {weaknesses.filter(w => w.severity === 'critical').length > 0 && (
                  <Badge variant="destructive">
                    {weaknesses.filter(w => w.severity === 'critical').length} Critical
                  </Badge>
                )}
                {weaknesses.filter(w => w.severity === 'high').length > 0 && (
                  <Badge variant="default">
                    {weaknesses.filter(w => w.severity === 'high').length} High
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              {weaknesses.map((weakness, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-md border ${
                    weakness.severity === 'critical' ? 'border-red-300 bg-red-50 dark:bg-red-950/30' :
                    weakness.severity === 'high' ? 'border-orange-300 bg-orange-50 dark:bg-orange-950/30' :
                    weakness.severity === 'medium' ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30' :
                    'border-blue-300 bg-blue-50 dark:bg-blue-950/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {getSeverityIcon(weakness.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{weakness.category}</span>
                        <Badge variant={getSeverityColor(weakness.severity) as any} className="text-xs">
                          {weakness.severity}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1">{weakness.issue}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Recommendation:</strong> {weakness.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw Analysis Display */}
        {analysis && weaknesses.length === 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Weakness Analysis</h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={downloadAsText}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[400px] border rounded-md p-4 bg-muted/30">
              <pre className="whitespace-pre-wrap text-sm">{analysis}</pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
