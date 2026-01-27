import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Loader2, Copy, Download, Sparkles, Upload, X, FileText, History, FolderOpen } from "lucide-react";
import { useClaimFiles } from "@/hooks/useClaimFiles";
import { ClaimFileSelector } from "./ClaimFileSelector";

interface DarwinSupplementGeneratorProps {
  claimId: string;
  claim: any;
}

export const DarwinSupplementGenerator = ({ claimId, claim }: DarwinSupplementGeneratorProps) => {
  const [existingEstimate, setExistingEstimate] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ourEstimatePdf, setOurEstimatePdf] = useState<File | null>(null);
  const [insuranceEstimatePdf, setInsuranceEstimatePdf] = useState<File | null>(null);
  const [selectedOurEstimateId, setSelectedOurEstimateId] = useState<string | null>(null);
  const [selectedInsuranceEstimateId, setSelectedInsuranceEstimateId] = useState<string | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [inputMethod, setInputMethod] = useState<string>("claim-files");
  const ourEstimateInputRef = useRef<HTMLInputElement>(null);
  const insuranceEstimateInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { files: claimFiles, loading: loadingFiles, downloadFileAsBase64 } = useClaimFiles(claimId);

  // Load previous analysis on mount
  useEffect(() => {
    const loadPreviousAnalysis = async () => {
      const { data } = await supabase
        .from('darwin_analysis_results')
        .select('*')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'supplement')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setAnalysis(data.result);
        setLastAnalyzed(new Date(data.created_at));
        setLastFileName(data.pdf_file_name || null);
      }
    };

    loadPreviousAnalysis();
  }, [claimId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'our' | 'insurance') => {
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
      if (type === 'our') {
        setOurEstimatePdf(file);
        setSelectedOurEstimateId(null);
      } else {
        setInsuranceEstimatePdf(file);
        setSelectedInsuranceEstimateId(null);
      }
    }
  };

  const clearFile = (type: 'our' | 'insurance') => {
    if (type === 'our') {
      setOurEstimatePdf(null);
      if (ourEstimateInputRef.current) {
        ourEstimateInputRef.current.value = '';
      }
    } else {
      setInsuranceEstimatePdf(null);
      if (insuranceEstimateInputRef.current) {
        insuranceEstimateInputRef.current.value = '';
      }
    }
  };

  const convertFileToBase64 = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      let ourEstimateContent: string | undefined;
      let insuranceEstimateContent: string | undefined;
      let ourFileName: string | undefined;
      let insuranceFileName: string | undefined;

      if (inputMethod === "claim-files") {
        const ourFile = claimFiles.find(f => f.id === selectedOurEstimateId);
        const insuranceFile = claimFiles.find(f => f.id === selectedInsuranceEstimateId);

        if (ourFile) {
          ourEstimateContent = await downloadFileAsBase64(ourFile.file_path) || undefined;
          ourFileName = ourFile.file_name;
        }
        if (insuranceFile) {
          insuranceEstimateContent = await downloadFileAsBase64(insuranceFile.file_path) || undefined;
          insuranceFileName = insuranceFile.file_name;
        }
      } else {
        if (ourEstimatePdf) {
          ourEstimateContent = await convertFileToBase64(ourEstimatePdf);
          ourFileName = ourEstimatePdf.name;
        }
        if (insuranceEstimatePdf) {
          insuranceEstimateContent = await convertFileToBase64(insuranceEstimatePdf);
          insuranceFileName = insuranceEstimatePdf.name;
        }
      }

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'supplement',
          content: additionalNotes,
          pdfContent: insuranceEstimateContent,
          pdfFileName: insuranceFileName,
          additionalContext: { 
            existingEstimate,
            ourEstimatePdf: ourEstimateContent,
            ourEstimatePdfName: ourFileName,
            insuranceEstimatePdf: insuranceEstimateContent,
            insuranceEstimatePdfName: insuranceFileName
          }
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      setLastAnalyzed(new Date());
      const fileNames = [ourFileName, insuranceFileName].filter(Boolean).join(' vs ');
      setLastFileName(fileNames || null);

      // Save the analysis result
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('darwin_analysis_results').insert({
        claim_id: claimId,
        analysis_type: 'supplement',
        input_summary: fileNames || existingEstimate.substring(0, 200),
        result: data.result,
        pdf_file_name: fileNames || null,
        created_by: userData.user?.id
      });

      toast({
        title: "Supplement generated",
        description: "Darwin has compared the estimates and identified supplement items"
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

  const ourEstimateFile = claimFiles.find(f => f.id === selectedOurEstimateId);
  const insuranceEstimateFile = claimFiles.find(f => f.id === selectedInsuranceEstimateId);

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
        {lastAnalyzed && (
          <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Previous analysis from {lastAnalyzed.toLocaleString()}
            {lastFileName && <span className="text-xs">({lastFileName})</span>}
          </div>
        )}

        <Tabs value={inputMethod} onValueChange={setInputMethod}>
          <TabsList className="flex flex-col sm:flex-row w-full h-auto gap-1 p-1">
            <TabsTrigger value="claim-files" className="w-full justify-start gap-2 px-3 py-2">
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              <span>Select from Claim Files</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="w-full justify-start gap-2 px-3 py-2">
              <Upload className="h-4 w-4 flex-shrink-0" />
              <span>Upload New PDFs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claim-files" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Our Estimate</label>
                <ClaimFileSelector
                  files={claimFiles}
                  loading={loadingFiles}
                  selectedFileId={selectedOurEstimateId}
                  onSelectFile={(file) => {
                    setSelectedOurEstimateId(file.id);
                    setOurEstimatePdf(null);
                  }}
                  height="150px"
                  emptyMessage="No PDFs found"
                />
                {ourEstimateFile && (
                  <p className="text-xs text-primary">Selected: {ourEstimateFile.file_name}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Insurance Estimate</label>
                <ClaimFileSelector
                  files={claimFiles}
                  loading={loadingFiles}
                  selectedFileId={selectedInsuranceEstimateId}
                  onSelectFile={(file) => {
                    setSelectedInsuranceEstimateId(file.id);
                    setInsuranceEstimatePdf(null);
                  }}
                  height="150px"
                  emptyMessage="No PDFs found"
                />
                {insuranceEstimateFile && (
                  <p className="text-xs text-primary">Selected: {insuranceEstimateFile.file_name}</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Our Estimate (PDF)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileChange(e, 'our')}
                    ref={ourEstimateInputRef}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => ourEstimateInputRef.current?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {ourEstimatePdf ? 'Change' : 'Upload'}
                  </Button>
                  {ourEstimatePdf && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md flex-1">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{ourEstimatePdf.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => clearFile('our')}
                        className="h-6 w-6 p-0 ml-auto flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Insurance Estimate (PDF)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileChange(e, 'insurance')}
                    ref={insuranceEstimateInputRef}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => insuranceEstimateInputRef.current?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {insuranceEstimatePdf ? 'Change' : 'Upload'}
                  </Button>
                  {insuranceEstimatePdf && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md flex-1">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{insuranceEstimatePdf.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => clearFile('insurance')}
                        className="h-6 w-6 p-0 ml-auto flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <label className="text-sm font-medium">Or Paste Estimate Items (optional)</label>
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
