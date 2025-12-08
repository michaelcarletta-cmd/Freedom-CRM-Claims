import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Loader2, Copy, Download, Sparkles } from "lucide-react";

interface DarwinSupplementGeneratorProps {
  claimId: string;
  claim: any;
}

export const DarwinSupplementGenerator = ({ claimId, claim }: DarwinSupplementGeneratorProps) => {
  const [existingEstimate, setExistingEstimate] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'supplement',
          content: additionalNotes,
          additionalContext: { existingEstimate }
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      toast({
        title: "Supplement generated",
        description: "Darwin has identified potential supplement items"
      });
    } catch (error: any) {
      console.error("Supplement generation error:", error);
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate supplement",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (analysis) {
      navigator.clipboard.writeText(analysis);
      toast({ title: "Copied", description: "Supplement copied to clipboard" });
    }
  };

  const downloadAsText = () => {
    if (analysis) {
      const blob = new Blob([analysis], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `supplement-${claim.claim_number || claimId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlusCircle className="h-5 w-5 text-green-600" />
          Supplement Generator
        </CardTitle>
        <CardDescription>
          Identify missed items, code upgrades, and hidden damage to maximize claim recovery
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Existing Estimate Items (optional)</label>
          <Textarea
            value={existingEstimate}
            onChange={(e) => setExistingEstimate(e.target.value)}
            placeholder="Paste existing estimate line items here to help identify what's missing..."
            className="min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Additional Observations (optional)</label>
          <Textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Note any specific damage observations, areas of concern, or items you suspect were missed..."
            className="min-h-[80px]"
          />
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Supplement...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Supplement Package
            </>
          )}
        </Button>

        {analysis && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Supplement Analysis</h4>
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
