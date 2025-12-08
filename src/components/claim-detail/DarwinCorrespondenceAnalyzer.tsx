import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, Copy, Send, Sparkles } from "lucide-react";

interface DarwinCorrespondenceAnalyzerProps {
  claimId: string;
  claim: any;
}

export const DarwinCorrespondenceAnalyzer = ({ claimId, claim }: DarwinCorrespondenceAnalyzerProps) => {
  const [correspondence, setCorrespondence] = useState("");
  const [previousResponses, setPreviousResponses] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!correspondence.trim()) {
      toast({
        title: "Content required",
        description: "Please paste the adjuster correspondence to analyze",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'correspondence',
          content: correspondence,
          additionalContext: { previousResponses }
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      toast({
        title: "Analysis complete",
        description: "Darwin has analyzed the correspondence"
      });
    } catch (error: any) {
      console.error("Correspondence analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze correspondence",
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

  // Extract just the draft response section for quick copy
  const copyDraftResponse = () => {
    if (analysis) {
      const draftStart = analysis.indexOf("DRAFT RESPONSE:");
      if (draftStart !== -1) {
        const draftContent = analysis.substring(draftStart);
        navigator.clipboard.writeText(draftContent);
        toast({ title: "Copied", description: "Draft response copied to clipboard" });
      } else {
        copyToClipboard();
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-blue-600" />
          Adjuster Correspondence Analyzer
        </CardTitle>
        <CardDescription>
          Analyze adjuster emails to understand tactics and get strategic response recommendations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Adjuster Email/Correspondence</label>
          <Textarea
            value={correspondence}
            onChange={(e) => setCorrespondence(e.target.value)}
            placeholder="Paste the adjuster's email or correspondence here..."
            className="min-h-[150px]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Previous Responses (optional)</label>
          <Textarea
            value={previousResponses}
            onChange={(e) => setPreviousResponses(e.target.value)}
            placeholder="Paste any previous responses for context..."
            className="min-h-[80px]"
          />
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={loading || !correspondence.trim()}
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
              Analyze & Generate Response
            </>
          )}
        </Button>

        {analysis && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Strategic Analysis</h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy All
                </Button>
                <Button variant="default" size="sm" onClick={copyDraftResponse}>
                  <Send className="h-4 w-4 mr-1" />
                  Copy Draft
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
