import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GitCompare, Loader2, Copy, Download, Sparkles, Upload, X, FileText, History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DarwinDocumentComparisonProps {
  claimId: string;
  claim: any;
}

interface UploadedDocument {
  file: File;
  label: string;
  base64?: string;
}

export const DarwinDocumentComparison = ({ claimId, claim }: DarwinDocumentComparisonProps) => {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  const [lastFileNames, setLastFileNames] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const documentLabels = [
    "Our Estimate",
    "Carrier Estimate",
    "Supplement",
    "Engineer Report",
    "Denial Letter",
    "Other"
  ];

  // Load previous analysis on mount
  useEffect(() => {
    const loadPreviousAnalysis = async () => {
      const { data } = await supabase
        .from('darwin_analysis_results')
        .select('*')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'document_comparison')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setAnalysis(data.result);
        setLastAnalyzed(new Date(data.created_at));
        setLastFileNames(data.pdf_file_name || null);
      }
    };

    loadPreviousAnalysis();
  }, [claimId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newDocs: UploadedDocument[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a PDF file`,
          variant: "destructive"
        });
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB`,
          variant: "destructive"
        });
        continue;
      }
      
      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let j = 0; j < bytes.length; j++) {
        binary += String.fromCharCode(bytes[j]);
      }
      const base64 = btoa(binary);
      
      newDocs.push({
        file,
        label: documents.length + newDocs.length === 0 ? "Our Estimate" : 
               documents.length + newDocs.length === 1 ? "Carrier Estimate" : "Other",
        base64
      });
    }

    setDocuments([...documents, ...newDocs]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(documents.filter((_, i) => i !== index));
  };

  const updateDocumentLabel = (index: number, label: string) => {
    const updated = [...documents];
    updated[index].label = label;
    setDocuments(updated);
  };

  const handleAnalyze = async () => {
    if (documents.length < 2) {
      toast({
        title: "Need more documents",
        description: "Please upload at least 2 documents to compare",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const pdfContents = documents.map(doc => ({
        content: doc.base64,
        fileName: doc.file.name,
        label: doc.label
      }));

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'document_comparison',
          multiplePdfs: pdfContents
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.result);
      setLastAnalyzed(new Date());
      const fileNames = documents.map(d => d.file.name).join(' vs ');
      setLastFileNames(fileNames);

      // Save the analysis result
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('darwin_analysis_results').insert({
        claim_id: claimId,
        analysis_type: 'document_comparison',
        input_summary: documents.map(d => `${d.label}: ${d.file.name}`).join(', '),
        result: data.result,
        pdf_file_name: fileNames,
        created_by: userData.user?.id
      });

      toast({
        title: "Comparison complete",
        description: "Darwin has analyzed the documents and identified discrepancies"
      });
    } catch (error: any) {
      console.error("Document comparison error:", error);
      toast({
        title: "Comparison failed",
        description: error.message || "Failed to compare documents",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (analysis) {
      navigator.clipboard.writeText(analysis);
      toast({ title: "Copied", description: "Comparison copied to clipboard" });
    }
  };

  const downloadAsText = () => {
    if (analysis) {
      const blob = new Blob([analysis], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comparison-${claim.claim_number || claimId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-blue-600" />
          Multi-Document Comparison
        </CardTitle>
        <CardDescription>
          Upload 2 or more PDFs (estimates, reports) and Darwin will generate a line-by-line comparison highlighting discrepancies
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastAnalyzed && (
          <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Previous comparison from {lastAnalyzed.toLocaleString()}
            {lastFileNames && <span className="text-xs">({lastFileNames})</span>}
          </div>
        )}

        {/* Document Upload Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Documents to Compare</label>
            <Badge variant="secondary">{documents.length} uploaded</Badge>
          </div>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            multiple
            className="hidden"
          />

          {documents.length > 0 && (
            <div className="space-y-2">
              {documents.map((doc, index) => (
                <div key={index} className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
                  <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="flex-1 text-sm truncate">{doc.file.name}</span>
                  <select
                    value={doc.label}
                    onChange={(e) => updateDocumentLabel(index, e.target.value)}
                    className="text-xs border rounded px-2 py-1 bg-background"
                  >
                    {documentLabels.map(label => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => removeDocument(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add PDF Document
          </Button>
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={loading || documents.length < 2}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Comparing Documents...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Compare Documents ({documents.length} files)
            </>
          )}
        </Button>

        {analysis && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Comparison Results</h4>
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
