import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileWarning, Loader2, Copy, Download, Sparkles } from "lucide-react";

interface DarwinDenialAnalyzerProps {
  claimId: string;
  claim: any;
}

export const DarwinDenialAnalyzer = ({ claimId, claim }: DarwinDenialAnalyzerProps) => {
  const [denialContent, setDenialContent] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!denialContent.trim()) {
      toast({
        title: "Content required",
        description: "Please paste the denial letter content to analyze",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'denial_rebuttal',
          content: denialContent
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      toast({
        title: "Analysis complete",
        description: "Darwin has generated your rebuttal"
      });
    } catch (error: any) {
      console.error("Denial analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze denial letter",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (analysis) {
      navigator.clipboard.writeText(analysis);
      toast({ title: "Copied", description: "Rebuttal copied to clipboard" });
    }
  };

  const downloadAsText = () => {
    if (analysis) {
      const blob = new Blob([analysis], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rebuttal-${claim.claim_number || claimId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-destructive" />
          Denial Letter Analyzer
        </CardTitle>
        <CardDescription>
          Paste a denial letter and Darwin will generate a point-by-point rebuttal with policy citations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Denial Letter Content</label>
          <Textarea
            value={denialContent}
            onChange={(e) => setDenialContent(e.target.value)}
            placeholder="Paste the denial letter content here..."
            className="min-h-[150px]"
          />
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={loading || !denialContent.trim()}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Rebuttal
            </>
          )}
        </Button>

        {analysis && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Generated Rebuttal</h4>
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
              <pre className="whitespace-pre-wrap text-sm font-mono">{analysis}</pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
