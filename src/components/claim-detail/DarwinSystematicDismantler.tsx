import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Gavel, Loader2, Copy, Download, Sparkles, Upload, X, FileText, History, 
  FolderOpen, AlertTriangle, Scale, Target, Shield, CheckCircle2, XCircle,
  ChevronDown, ChevronUp
} from "lucide-react";
import { useClaimFiles } from "@/hooks/useClaimFiles";
import { ClaimFileSelector } from "./ClaimFileSelector";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DarwinSystematicDismantlerProps {
  claimId: string;
  claim: any;
}

interface AssertionAnalysis {
  id: string;
  carrierAssertion: string;
  burdenHolder: 'carrier' | 'policyholder';
  burdenMet: boolean;
  burdenAnalysis: string;
  syllogism: {
    premise1Policy: string;
    premise2Facts: string;
    conclusion: string;
    premisesAccurate: boolean;
    evidenceSupport: boolean;
    logicallyValid: boolean;
    failures: string[];
  };
  proceduralDefects: string[];
  requiredEvidence: string[];
  counterArguments: string[];
  authorityViolations: string[];
  score: {
    policyAlignment: number;
    evidenceQuality: number;
    proceduralCompliance: number;
    logicalConsistency: number;
    overall: number;
  };
}

interface DismantlingResult {
  statementOfDispute: string;
  assertions: AssertionAnalysis[];
  movingGoalposts: string[];
  postHocRationalizations: string[];
  overallProceduralDefects: string[];
  requiredCarrierActions: string[];
  escalationRecommendations: string[];
  overallScore: number;
  rawAnalysis: string;
}

export const DarwinSystematicDismantler = ({ claimId, claim }: DarwinSystematicDismantlerProps) => {
  const [carrierContent, setCarrierContent] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedClaimFileId, setSelectedClaimFileId] = useState<string | null>(null);
  const [previousResponses, setPreviousResponses] = useState("");
  const [result, setResult] = useState<DismantlingResult | null>(null);
  const [rawAnalysis, setRawAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  const [inputMethod, setInputMethod] = useState<string>("claim-files");
  const [expandedAssertions, setExpandedAssertions] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const { files: claimFiles, loading: loadingFiles, downloadFileAsBase64 } = useClaimFiles(claimId);

  // Load previous analysis on mount
  useEffect(() => {
    const loadPreviousAnalysis = async () => {
      const { data } = await supabase
        .from('darwin_analysis_results')
        .select('*')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'systematic_dismantling')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setRawAnalysis(data.result);
        setLastAnalyzed(new Date(data.created_at));
        // Try to parse structured result if available
        try {
          if (data.input_summary && data.input_summary.startsWith('{')) {
            setResult(JSON.parse(data.input_summary));
          }
        } catch {}
      }
    };

    loadPreviousAnalysis();
  }, [claimId]);

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
      setSelectedClaimFileId(null);
    }
  };

  const removeFile = () => {
    setPdfFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleAssertion = (id: string) => {
    const newExpanded = new Set(expandedAssertions);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedAssertions(newExpanded);
  };

  const handleAnalyze = async () => {
    const selectedFile = claimFiles.find(f => f.id === selectedClaimFileId);
    
    if (!carrierContent.trim() && !pdfFile && !selectedFile) {
      toast({
        title: "Content required",
        description: "Please select a file, upload a PDF, or paste content",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      let pdfBase64: string | null = null;
      let fileName: string | undefined;

      if (selectedFile) {
        pdfBase64 = await downloadFileAsBase64(selectedFile.file_path);
        fileName = selectedFile.file_name;
      } else if (pdfFile) {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
        fileName = pdfFile.name;
      }

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'systematic_dismantling',
          content: carrierContent || undefined,
          pdfContent: pdfBase64 || undefined,
          pdfFileName: fileName,
          additionalContext: { previousResponses }
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setRawAnalysis(data.result);
      setLastAnalyzed(new Date());

      // Try to parse structured result
      if (data.structured) {
        setResult(data.structured);
      }

      // Save the analysis result
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('darwin_analysis_results').insert({
        claim_id: claimId,
        analysis_type: 'systematic_dismantling',
        input_summary: data.structured ? JSON.stringify(data.structured) : (fileName || carrierContent.substring(0, 200)),
        result: data.result,
        pdf_file_name: fileName || null,
        created_by: userData.user?.id
      });

      toast({
        title: "Systematic dismantling complete",
        description: "Carrier position has been analyzed and dismantled"
      });
    } catch (error: any) {
      console.error("Systematic dismantling error:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze carrier response",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (rawAnalysis) {
      navigator.clipboard.writeText(rawAnalysis);
      toast({ title: "Copied", description: "Analysis copied to clipboard" });
    }
  };

  const downloadAsText = () => {
    if (rawAnalysis) {
      const blob = new Blob([rawAnalysis], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `systematic-dismantling-${claim.claim_number || claimId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const selectedFile = claimFiles.find(f => f.id === selectedClaimFileId);
  const hasInput = carrierContent.trim() || pdfFile || selectedFile;

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-red-600 bg-red-100";
    if (score >= 40) return "text-yellow-600 bg-yellow-100";
    return "text-green-600 bg-green-100";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return "Easily Dismantled";
    if (score >= 40) return "Vulnerable";
    return "Requires Careful Approach";
  };

  return (
    <Card className="border-2 border-destructive/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-destructive" />
          Systematic Carrier Dismantler
        </CardTitle>
        <CardDescription>
          Systematically dismantle carrier denials using burden-of-proof enforcement, policy supremacy, 
          procedural compliance analysis, and formal logic validation. Every assertion is treated as 
          unsupported until proven otherwise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastAnalyzed && (
          <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Previous analysis from {lastAnalyzed.toLocaleString()}
          </div>
        )}

        <div className="p-3 bg-destructive/10 rounded-md border border-destructive/20">
          <div className="flex items-start gap-2">
            <Shield className="h-5 w-5 text-destructive mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Non-Negotiable System Behaviors</p>
              <ul className="mt-1 text-muted-foreground space-y-1">
                <li>• Carrier determinations are unsupported until proven otherwise</li>
                <li>• Every assertion is decomposed and tested independently</li>
                <li>• Burden of proof strictly enforced on each claim</li>
                <li>• Output is escalation-ready (DOI, appraisal, litigation)</li>
              </ul>
            </div>
          </div>
        </div>

        <Tabs value={inputMethod} onValueChange={setInputMethod}>
          <TabsList className="flex flex-col sm:flex-row w-full h-auto gap-1 p-1">
            <TabsTrigger value="claim-files" className="w-full justify-start gap-2 px-3 py-2">
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              <span>Claim Files</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="w-full justify-start gap-2 px-3 py-2">
              <Upload className="h-4 w-4 flex-shrink-0" />
              <span>Upload PDF</span>
            </TabsTrigger>
            <TabsTrigger value="paste" className="w-full justify-start gap-2 px-3 py-2">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span>Paste Content</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claim-files" className="space-y-2 mt-4">
            <label className="text-sm font-medium">Select Carrier Response/Denial</label>
            <ClaimFileSelector
              files={claimFiles}
              loading={loadingFiles}
              selectedFileId={selectedClaimFileId}
              onSelectFile={(file) => {
                setSelectedClaimFileId(file.id);
                setPdfFile(null);
                setCarrierContent("");
              }}
              height="200px"
            />
          </TabsContent>

          <TabsContent value="upload" className="space-y-2 mt-4">
            <label className="text-sm font-medium">Upload Carrier Response (PDF)</label>
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
          </TabsContent>

          <TabsContent value="paste" className="space-y-2 mt-4">
            <label className="text-sm font-medium">Carrier Response Content</label>
            <Textarea
              value={carrierContent}
              onChange={(e) => {
                setCarrierContent(e.target.value);
                setSelectedClaimFileId(null);
                setPdfFile(null);
              }}
              placeholder="Paste the carrier's denial letter or response here..."
              className="min-h-[150px]"
            />
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <label className="text-sm font-medium">Previous Carrier Responses (for goalpost detection)</label>
          <Textarea
            value={previousResponses}
            onChange={(e) => setPreviousResponses(e.target.value)}
            placeholder="Paste any previous carrier responses to detect moving goalposts and post-hoc rationalizations..."
            className="min-h-[80px]"
          />
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={loading || !hasInput}
          className="w-full bg-destructive hover:bg-destructive/90"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Systematically Dismantling...
            </>
          ) : (
            <>
              <Gavel className="h-4 w-4 mr-2" />
              Dismantle Carrier Position
            </>
          )}
        </Button>

        {rawAnalysis && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h4 className="font-medium">Systematic Analysis</h4>
                {result?.overallScore !== undefined && (
                  <Badge className={getScoreColor(100 - result.overallScore)}>
                    Carrier Position: {getScoreLabel(100 - result.overallScore)}
                  </Badge>
                )}
              </div>
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

            <ScrollArea className="h-[600px] border rounded-md p-4 bg-muted/30">
              <pre className="whitespace-pre-wrap text-sm font-mono">{rawAnalysis}</pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
