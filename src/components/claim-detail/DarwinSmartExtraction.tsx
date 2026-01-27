import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileSearch, Loader2, Upload, X, FileText, History, Save, Table, FolderOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useClaimFiles } from "@/hooks/useClaimFiles";
import { ClaimFileSelector } from "./ClaimFileSelector";

interface DarwinSmartExtractionProps {
  claimId: string;
  claim: any;
}

interface ExtractedData {
  id?: string;
  documentType: string;
  sourceFileName: string;
  rcvTotal?: number;
  acvTotal?: number;
  deductible?: number;
  depreciation?: number;
  lineItems: Array<{
    description: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    total?: number;
    category?: string;
  }>;
  rawData: Record<string, any>;
  extractionConfidence?: number;
  createdAt?: string;
}

export const DarwinSmartExtraction = ({ claimId, claim }: DarwinSmartExtractionProps) => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedClaimFileId, setSelectedClaimFileId] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>("estimate");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [previousExtractions, setPreviousExtractions] = useState<ExtractedData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputMethod, setInputMethod] = useState<string>("claim-files");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { files: claimFiles, loading: loadingFiles, downloadFileAsBase64 } = useClaimFiles(claimId);

  const documentTypes = [
    { value: "estimate", label: "Estimate (Xactimate, etc.)" },
    { value: "carrier_estimate", label: "Carrier Estimate" },
    { value: "denial", label: "Denial Letter" },
    { value: "engineer_report", label: "Engineer Report" },
    { value: "invoice", label: "Invoice" },
    { value: "settlement", label: "Settlement Statement" },
  ];

  // Load previous extractions on mount
  useEffect(() => {
    const loadPreviousExtractions = async () => {
      const { data } = await supabase
        .from('extracted_document_data')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });

      if (data) {
        setPreviousExtractions(data.map((d: any) => ({
          id: d.id,
          documentType: d.document_type,
          sourceFileName: d.source_file_name,
          rcvTotal: d.rcv_total,
          acvTotal: d.acv_total,
          deductible: d.deductible,
          depreciation: d.depreciation,
          lineItems: d.line_items || [],
          rawData: d.extracted_data || {},
          extractionConfidence: d.extraction_confidence,
          createdAt: d.created_at
        })));
      }
    };

    loadPreviousExtractions();
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
      setExtractedData(null);
    }
  };

  const removeFile = () => {
    setPdfFile(null);
    setExtractedData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExtract = async () => {
    const selectedFile = claimFiles.find(f => f.id === selectedClaimFileId);
    
    if (!pdfFile && !selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file from claim files or upload a PDF",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      let pdfBase64: string | null = null;
      let fileName: string;

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
      } else {
        throw new Error("No file selected");
      }

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'smart_extraction',
          pdfContent: pdfBase64,
          pdfFileName: fileName,
          additionalContext: { documentType }
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      // Parse the structured response
      const extracted: ExtractedData = {
        documentType,
        sourceFileName: fileName,
        rcvTotal: data.extractedData?.rcv_total,
        acvTotal: data.extractedData?.acv_total,
        deductible: data.extractedData?.deductible,
        depreciation: data.extractedData?.depreciation,
        lineItems: data.extractedData?.line_items || [],
        rawData: data.extractedData || {},
        extractionConfidence: data.confidence
      };

      setExtractedData(extracted);

      toast({
        title: "Extraction complete",
        description: `Extracted ${extracted.lineItems.length} line items from ${fileName}`
      });
    } catch (error: any) {
      console.error("Extraction error:", error);
      toast({
        title: "Extraction failed",
        description: error.message || "Failed to extract data from document",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!extractedData) return;

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('extracted_document_data').insert({
        claim_id: claimId,
        document_type: extractedData.documentType,
        source_file_name: extractedData.sourceFileName,
        extracted_data: extractedData.rawData,
        rcv_total: extractedData.rcvTotal,
        acv_total: extractedData.acvTotal,
        deductible: extractedData.deductible,
        depreciation: extractedData.depreciation,
        line_items: extractedData.lineItems,
        extraction_confidence: extractedData.extractionConfidence,
        created_by: userData.user?.id
      });

      if (error) throw error;

      toast({
        title: "Saved",
        description: "Extracted data saved to claim"
      });

      // Refresh previous extractions
      const { data: updated } = await supabase
        .from('extracted_document_data')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });

      if (updated) {
        setPreviousExtractions(updated.map((d: any) => ({
          id: d.id,
          documentType: d.document_type,
          sourceFileName: d.source_file_name,
          rcvTotal: d.rcv_total,
          acvTotal: d.acv_total,
          deductible: d.deductible,
          depreciation: d.depreciation,
          lineItems: d.line_items || [],
          rawData: d.extracted_data || {},
          extractionConfidence: d.extraction_confidence,
          createdAt: d.created_at
        })));
      }

      setExtractedData(null);
      setPdfFile(null);
      setSelectedClaimFileId(null);
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: error.message || "Failed to save extracted data",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return "—";
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const selectedFile = claimFiles.find(f => f.id === selectedClaimFileId);
  const hasFile = pdfFile || selectedFile;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-purple-600" />
          Smart Document Extraction
        </CardTitle>
        <CardDescription>
          Extract structured data (RCV, ACV, line items, deductibles) from PDF documents and save to the claim
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Previous Extractions */}
        {previousExtractions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Previous Extractions</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {previousExtractions.slice(0, 4).map((ext, index) => (
                <div key={ext.id || index} className="p-3 bg-muted/30 rounded-md text-sm border">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{ext.sourceFileName}</span>
                    <Badge variant="outline" className="text-xs">{ext.documentType}</Badge>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    {ext.rcvTotal && <span>RCV: {formatCurrency(ext.rcvTotal)}</span>}
                    {ext.acvTotal && <span>ACV: {formatCurrency(ext.acvTotal)}</span>}
                    <span>{ext.lineItems.length} items</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Document Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Document Type</label>
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {documentTypes.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* File Selection Tabs */}
        <Tabs value={inputMethod} onValueChange={setInputMethod}>
          <TabsList className="flex flex-col sm:flex-row w-full h-auto gap-1 p-1">
            <TabsTrigger value="claim-files" className="w-full justify-start gap-2 px-3 py-2">
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              <span>Claim Files</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="w-full justify-start gap-2 px-3 py-2">
              <Upload className="h-4 w-4 flex-shrink-0" />
              <span>Upload</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claim-files" className="space-y-2 mt-4">
            <label className="text-sm font-medium">Select from Claim Files</label>
            <ClaimFileSelector
              files={claimFiles}
              loading={loadingFiles}
              selectedFileId={selectedClaimFileId}
              onSelectFile={(file) => {
                setSelectedClaimFileId(file.id);
                setPdfFile(null);
                setExtractedData(null);
              }}
              height="180px"
            />
          </TabsContent>

          <TabsContent value="upload" className="space-y-2 mt-4">
            <label className="text-sm font-medium">Upload Document (PDF)</label>
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
        </Tabs>

        <Button 
          onClick={handleExtract} 
          disabled={loading || !hasFile}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Extracting Data...
            </>
          ) : (
            <>
              <Table className="h-4 w-4 mr-2" />
              Extract Data from PDF
            </>
          )}
        </Button>

        {/* Extracted Data Display */}
        {extractedData && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Extracted Data</h4>
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save to Claim
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-md">
                <div className="text-xs text-muted-foreground">RCV Total</div>
                <div className="font-semibold">{formatCurrency(extractedData.rcvTotal)}</div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                <div className="text-xs text-muted-foreground">ACV Total</div>
                <div className="font-semibold">{formatCurrency(extractedData.acvTotal)}</div>
              </div>
              <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-md">
                <div className="text-xs text-muted-foreground">Deductible</div>
                <div className="font-semibold">{formatCurrency(extractedData.deductible)}</div>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-md">
                <div className="text-xs text-muted-foreground">Depreciation</div>
                <div className="font-semibold">{formatCurrency(extractedData.depreciation)}</div>
              </div>
            </div>

            {/* Line Items */}
            {extractedData.lineItems.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">Line Items ({extractedData.lineItems.length})</h5>
                <ScrollArea className="h-[250px] border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Description</th>
                        <th className="text-right p-2 font-medium">Qty</th>
                        <th className="text-right p-2 font-medium">Unit Price</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedData.lineItems.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-2">{item.description}</td>
                          <td className="p-2 text-right">{item.quantity || "—"} {item.unit || ""}</td>
                          <td className="p-2 text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            {extractedData.extractionConfidence && (
              <div className="text-xs text-muted-foreground">
                Extraction confidence: {Math.round(extractedData.extractionConfidence * 100)}%
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
