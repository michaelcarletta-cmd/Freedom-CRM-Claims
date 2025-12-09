import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HardHat, Loader2, Copy, Download, Sparkles, Upload, X, FileText } from "lucide-react";

interface DarwinEngineerReportAnalyzerProps {
  claimId: string;
  claim: any;
}

export const DarwinEngineerReportAnalyzer = ({ claimId, claim }: DarwinEngineerReportAnalyzerProps) => {
  const [reportContent, setReportContent] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [additionalContext, setAdditionalContext] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive"
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload a file smaller than 10MB",
          variant: "destructive"
        });
        return;
      }
      setPdfFile(file);
    }
  };

  const removeFile = () => {
    setPdfFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!reportContent.trim() && !pdfFile) {
      toast({
        title: "Content required",
        description: "Please paste the engineer report content or upload a PDF",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      let pdfBase64 = null;
      if (pdfFile) {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
      }

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'engineer_report_rebuttal',
          content: reportContent || undefined,
          pdfContent: pdfBase64 || undefined,
          pdfFileName: pdfFile?.name || undefined,
          additionalContext: additionalContext || undefined
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      toast({
        title: "Analysis complete",
        description: "Darwin has generated your engineer report rebuttal"
      });
    } catch (error: any) {
      console.error("Engineer report analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze engineer report",
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
      a.download = `engineer-rebuttal-${claim.claim_number || claimId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardHat className="h-5 w-5 text-orange-500" />
          Engineer Report Analyzer
        </CardTitle>
        <CardDescription>
          Upload an engineer's report PDF or paste content and Darwin will identify flaws, methodological issues, and generate a professional rebuttal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PDF Upload Section */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Upload Engineer Report (PDF)</label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            className="hidden"
          />
          {pdfFile ? (
            <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
              <FileText className="h-5 w-5 text-primary" />
              <span className="flex-1 text-sm truncate">{pdfFile.name}</span>
              <Button variant="ghost" size="sm" onClick={removeFile}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Select PDF File
            </Button>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or paste content</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Engineer Report Content</label>
          <Textarea
            value={reportContent}
            onChange={(e) => setReportContent(e.target.value)}
            placeholder="Paste the engineer's report content here..."
            className="min-h-[120px]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Additional Context (Optional)</label>
          <Textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Add any additional observations, photos descriptions, or contradictory evidence that should be considered..."
            className="min-h-[80px]"
          />
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={loading || (!reportContent.trim() && !pdfFile)}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing Report...
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
              <h4 className="font-medium">Engineer Report Rebuttal</h4>
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
