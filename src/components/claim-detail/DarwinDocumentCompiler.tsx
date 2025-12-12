import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Image, Loader2, Download, Copy, FolderOpen, Camera, File, CheckSquare } from "lucide-react";
import { format } from "date-fns";

interface DarwinDocumentCompilerProps {
  claimId: string;
  claim: any;
}

interface ClaimPhoto {
  id: string;
  file_name: string;
  file_path: string;
  category: string | null;
  description: string | null;
  created_at: string | null;
}

interface ClaimFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  folder_id: string | null;
  uploaded_at: string | null;
}

const REPORT_TYPES = [
  { id: 'proof_of_loss', name: 'Proof of Loss Package', description: 'Complete sworn statement of loss with supporting documentation' },
  { id: 'damage_explanation', name: 'Detailed Damage Explanation', description: 'Comprehensive explanation of all damages with photo evidence' },
  { id: 'carrier_package', name: 'Carrier Submission Package', description: 'Professional package for insurance carrier submission' },
  { id: 'supplement_request', name: 'Supplement Request Package', description: 'Detailed supplement with supporting photos and documents' },
  { id: 'demand_letter', name: 'Demand Letter with Exhibits', description: 'Formal demand with compiled evidence exhibits' },
];

export const DarwinDocumentCompiler = ({ claimId, claim }: DarwinDocumentCompilerProps) => {
  const [photos, setPhotos] = useState<ClaimPhoto[]>([]);
  const [files, setFiles] = useState<ClaimFile[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [reportType, setReportType] = useState('damage_explanation');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [lastReportDate, setLastReportDate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [claimId]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      // Load photos
      const { data: photosData, error: photosError } = await supabase
        .from('claim_photos')
        .select('id, file_name, file_path, category, description, created_at')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });

      if (photosError) throw photosError;
      setPhotos(photosData || []);

      // Load files (PDFs, documents)
      const { data: filesData, error: filesError } = await supabase
        .from('claim_files')
        .select('id, file_name, file_path, file_type, folder_id, uploaded_at')
        .eq('claim_id', claimId)
        .order('uploaded_at', { ascending: false });

      if (filesError) throw filesError;
      // Filter to only document types
      const documentFiles = (filesData || []).filter(f => {
        const ext = f.file_name?.toLowerCase() || '';
        return ext.endsWith('.pdf') || ext.endsWith('.docx') || ext.endsWith('.doc') || ext.endsWith('.xlsx') || ext.endsWith('.xls');
      });
      setFiles(documentFiles);

      // Load previous report
      const { data: previousReport } = await supabase
        .from('darwin_analysis_results')
        .select('result, created_at')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'document_compilation')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (previousReport) {
        setGeneratedReport(previousReport.result);
        setLastReportDate(previousReport.created_at);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const togglePhoto = (id: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPhotos(newSelected);
  };

  const toggleFile = (id: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedFiles(newSelected);
  };

  const selectAllPhotos = () => {
    setSelectedPhotos(new Set(photos.map(p => p.id)));
  };

  const clearPhotos = () => {
    setSelectedPhotos(new Set());
  };

  const selectAllFiles = () => {
    setSelectedFiles(new Set(files.map(f => f.id)));
  };

  const clearFiles = () => {
    setSelectedFiles(new Set());
  };

  const getPhotoUrls = async (photoIds: string[]): Promise<{id: string; url: string; category: string | null; description: string | null}[]> => {
    const selectedPhotoData = photos.filter(p => photoIds.includes(p.id));
    const urls: {id: string; url: string; category: string | null; description: string | null}[] = [];

    for (const photo of selectedPhotoData) {
      const { data } = await supabase.storage
        .from('claim-photos')
        .createSignedUrl(photo.file_path, 3600);
      
      if (data?.signedUrl) {
        urls.push({
          id: photo.id,
          url: data.signedUrl,
          category: photo.category,
          description: photo.description
        });
      }
    }
    return urls;
  };

  const getFileContents = async (fileIds: string[]): Promise<{id: string; name: string; content: string; type: string}[]> => {
    const selectedFileData = files.filter(f => fileIds.includes(f.id));
    const contents: {id: string; name: string; content: string; type: string}[] = [];

    for (const file of selectedFileData) {
      // Only process PDFs for now - they can be sent as base64
      if (file.file_name.toLowerCase().endsWith('.pdf')) {
        const { data, error } = await supabase.storage
          .from('claim-files')
          .download(file.file_path);

        if (data && !error) {
          const base64 = await blobToBase64(data);
          contents.push({
            id: file.id,
            name: file.file_name,
            content: base64,
            type: 'pdf'
          });
        }
      }
    }
    return contents;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleGenerate = async () => {
    if (selectedPhotos.size === 0 && selectedFiles.size === 0) {
      toast.error('Please select at least one photo or document');
      return;
    }

    setLoading(true);
    try {
      // Get photo URLs and file contents
      const photoUrls = await getPhotoUrls(Array.from(selectedPhotos));
      const fileContents = await getFileContents(Array.from(selectedFiles));

      console.log(`Compiling report with ${photoUrls.length} photos and ${fileContents.length} documents`);

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'document_compilation',
          additionalContext: {
            reportType,
            additionalInstructions,
            photos: photoUrls,
            documents: fileContents.map(d => ({ name: d.name, type: d.type })),
            photoCount: photoUrls.length,
            documentCount: fileContents.length
          },
          // Send first PDF as pdfContent if available
          pdfContent: fileContents.length > 0 ? fileContents[0].content : undefined,
          pdfFileName: fileContents.length > 0 ? fileContents[0].name : undefined
        }
      });

      if (error) throw error;

      setGeneratedReport(data.result);
      setLastReportDate(new Date().toISOString());

      // Save to database
      await supabase.from('darwin_analysis_results').insert({
        claim_id: claimId,
        analysis_type: 'document_compilation',
        result: data.result,
        input_summary: `Report Type: ${reportType}, Photos: ${selectedPhotos.size}, Documents: ${selectedFiles.size}`
      });

      toast.success('Report compiled successfully');
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error(error.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedReport) {
      navigator.clipboard.writeText(generatedReport);
      toast.success('Copied to clipboard');
    }
  };

  const downloadAsText = () => {
    if (!generatedReport) return;
    const blob = new Blob([generatedReport], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_${claim.claim_number || claimId}_${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  if (loadingData) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading claim data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Document Compiler
        </CardTitle>
        <CardDescription>
          Select photos and documents for AI to compile into professional carrier reports
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Report Type Selection */}
        <div className="space-y-2">
          <Label>Report Type</Label>
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_TYPES.map(type => (
                <SelectItem key={type.id} value={type.id}>
                  <div className="flex flex-col">
                    <span>{type.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {REPORT_TYPES.find(t => t.id === reportType)?.description}
          </p>
        </div>

        {/* Selection Tabs */}
        <Tabs defaultValue="photos" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="photos" className="gap-2">
              <Camera className="h-4 w-4" />
              Photos ({selectedPhotos.size}/{photos.length})
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <File className="h-4 w-4" />
              Documents ({selectedFiles.size}/{files.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="photos" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {photos.length === 0 ? 'No photos uploaded' : `${photos.length} photos available`}
              </p>
              {photos.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllPhotos}>
                    <CheckSquare className="h-4 w-4 mr-1" />
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearPhotos}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
            
            {photos.length > 0 && (
              <ScrollArea className="h-[200px] border rounded-md p-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {photos.map(photo => (
                    <div
                      key={photo.id}
                      className={`relative flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50 ${
                        selectedPhotos.has(photo.id) ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => togglePhoto(photo.id)}
                    >
                      <Checkbox
                        checked={selectedPhotos.has(photo.id)}
                        onCheckedChange={() => togglePhoto(photo.id)}
                      />
                      <Image className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="overflow-hidden flex-1 min-w-0">
                        <p className="text-xs truncate">{photo.file_name}</p>
                        {photo.category && (
                          <p className="text-xs text-muted-foreground truncate">{photo.category}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {files.length === 0 ? 'No documents uploaded' : `${files.length} documents available (PDFs only for AI analysis)`}
              </p>
              {files.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllFiles}>
                    <CheckSquare className="h-4 w-4 mr-1" />
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearFiles}>
                    Clear
                  </Button>
                </div>
              )}
            </div>

            {files.length > 0 && (
              <ScrollArea className="h-[200px] border rounded-md p-3">
                <div className="space-y-2">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className={`flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50 ${
                        selectedFiles.has(file.id) ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => toggleFile(file.id)}
                    >
                      <Checkbox
                        checked={selectedFiles.has(file.id)}
                        onCheckedChange={() => toggleFile(file.id)}
                      />
                      <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="overflow-hidden flex-1 min-w-0">
                        <p className="text-sm truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.uploaded_at ? format(new Date(file.uploaded_at), 'MMM d, yyyy') : 'Unknown date'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        {/* Additional Instructions */}
        <div className="space-y-2">
          <Label>Additional Instructions (Optional)</Label>
          <Textarea
            placeholder="Add any specific instructions or context for the report..."
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            rows={3}
          />
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={loading || (selectedPhotos.size === 0 && selectedFiles.size === 0)}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Compiling Report...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              Generate {REPORT_TYPES.find(t => t.id === reportType)?.name}
            </>
          )}
        </Button>

        {/* Generated Report */}
        {generatedReport && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Generated Report</Label>
              {lastReportDate && (
                <span className="text-xs text-muted-foreground">
                  Generated: {format(new Date(lastReportDate), 'MMM d, yyyy h:mm a')}
                </span>
              )}
            </div>
            <ScrollArea className="h-[300px] border rounded-md p-4 bg-muted/20">
              <pre className="text-sm whitespace-pre-wrap font-sans">{generatedReport}</pre>
            </ScrollArea>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={downloadAsText}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
