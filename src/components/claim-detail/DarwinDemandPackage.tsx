import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Loader2, Download, Copy, FolderOpen, File, CheckSquare, AlertCircle, Briefcase, Camera } from "lucide-react";
import { format } from "date-fns";

interface DarwinDemandPackageProps {
  claimId: string;
  claim: any;
}

interface ClaimFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  folder_id: string | null;
  folder_name?: string;
  uploaded_at: string | null;
}

interface ClaimPhoto {
  id: string;
  file_name: string;
  file_path: string;
  category: string | null;
  description: string | null;
}

export const DarwinDemandPackage = ({ claimId, claim }: DarwinDemandPackageProps) => {
  const [files, setFiles] = useState<ClaimFile[]>([]);
  const [photos, setPhotos] = useState<ClaimPhoto[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [generatedPackage, setGeneratedPackage] = useState<string | null>(null);
  const [lastPackageDate, setLastPackageDate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [claimId]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      // Load folders first to get folder names
      const { data: foldersData } = await supabase
        .from('claim_folders')
        .select('id, name')
        .eq('claim_id', claimId);
      
      const folderMap = new Map(foldersData?.map(f => [f.id, f.name]) || []);

      // Load files (PDFs and documents)
      const { data: filesData, error: filesError } = await supabase
        .from('claim_files')
        .select('id, file_name, file_path, file_type, folder_id, uploaded_at')
        .eq('claim_id', claimId)
        .order('uploaded_at', { ascending: false });

      if (filesError) throw filesError;
      
      // Filter to PDFs only and add folder names
      const documentFiles = (filesData || [])
        .filter(f => f.file_name?.toLowerCase().endsWith('.pdf'))
        .map(f => ({
          ...f,
          folder_name: f.folder_id ? folderMap.get(f.folder_id) : undefined
        }));
      setFiles(documentFiles);

      // Load photos
      const { data: photosData } = await supabase
        .from('claim_photos')
        .select('id, file_name, file_path, category, description')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });
      
      setPhotos(photosData || []);

      // Load previous demand package
      const { data: previousPackage } = await supabase
        .from('darwin_analysis_results')
        .select('result, created_at')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'demand_package')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousPackage) {
        setGeneratedPackage(previousPackage.result);
        setLastPackageDate(previousPackage.created_at);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoadingData(false);
    }
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

  const togglePhoto = (id: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPhotos(newSelected);
  };

  const selectAllFiles = () => setSelectedFiles(new Set(files.map(f => f.id)));
  const clearFiles = () => setSelectedFiles(new Set());
  const selectAllPhotos = () => setSelectedPhotos(new Set(photos.map(p => p.id)));
  const clearPhotos = () => setSelectedPhotos(new Set());

  const handleGenerate = async () => {
    if (selectedFiles.size === 0) {
      toast.error('Please select at least one evidence document');
      return;
    }

    setLoading(true);
    toast.info('Analyzing documents and building demand package... This may take 2-3 minutes.');

    try {
      // Get file contents (PDFs as base64)
      const selectedFileData = files.filter(f => selectedFiles.has(f.id));
      const fileContents: { name: string; content: string; folder: string }[] = [];

      for (const file of selectedFileData) {
        const { data, error } = await supabase.storage
          .from('claim-files')
          .download(file.file_path);

        if (data && !error) {
          const base64 = await blobToBase64(data);
          fileContents.push({
            name: file.file_name,
            content: base64,
            folder: file.folder_name || 'Uncategorized'
          });
        }
      }

      // Get photo info if selected
      const selectedPhotoData = photos.filter(p => selectedPhotos.has(p.id));
      const photoInfo = selectedPhotoData.map((p, i) => ({
        number: i + 1,
        name: p.file_name,
        category: p.category || 'General',
        description: p.description || ''
      }));

      console.log(`Generating demand package with ${fileContents.length} documents and ${photoInfo.length} photos`);

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'demand_package',
          additionalContext: {
            additionalInstructions,
            documentCount: fileContents.length,
            documents: fileContents.map(f => ({ name: f.name, folder: f.folder })),
            photoCount: photoInfo.length,
            photos: photoInfo
          },
          // Send all PDF contents for analysis
          pdfContents: fileContents
        }
      });

      if (error) throw error;

      setGeneratedPackage(data.result);
      setLastPackageDate(new Date().toISOString());

      // Save to database
      await supabase.from('darwin_analysis_results').insert({
        claim_id: claimId,
        analysis_type: 'demand_package',
        result: data.result,
        input_summary: `Documents: ${fileContents.length}, Photos: ${photoInfo.length}`
      });

      toast.success('Demand package generated successfully');
    } catch (error: any) {
      console.error('Error generating demand package:', error);
      toast.error(error.message || 'Failed to generate demand package');
    } finally {
      setLoading(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const copyToClipboard = () => {
    if (generatedPackage) {
      navigator.clipboard.writeText(generatedPackage);
      toast.success('Copied to clipboard');
    }
  };

  const downloadAsText = () => {
    if (!generatedPackage) return;
    const blob = new Blob([generatedPackage], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demand_package_${claim.claim_number || claimId}_${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Demand package downloaded');
  };

  const saveAsWord = async () => {
    if (!generatedPackage) return;
    
    toast.info('Generating Word document...');
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-photo-report-docx', {
        body: {
          reportContent: generatedPackage,
          claimId,
          reportTitle: `Demand Package - ${claim.policyholder_name || 'Claim'} - ${format(new Date(), 'yyyy-MM-dd')}`,
          reportType: 'demand_package',
          companyBranding: null
        }
      });

      if (error) throw error;

      if (data.downloadUrl) {
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.fileName || `demand_package_${claim.claim_number || claimId}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success('Word document saved and downloaded');
      }
    } catch (error: any) {
      console.error('Error saving as Word:', error);
      toast.error(error.message || 'Failed to generate Word document');
    }
  };

  if (loadingData) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading claim evidence...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Demand Package Builder
        </CardTitle>
        <CardDescription>
          Select evidence documents for Darwin to analyze and compile into a comprehensive demand package. Darwin will review the actual content of each document to build your case.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>How it works:</strong> Select the PDF documents containing evidence (inspection reports, estimates, photos with descriptions, etc.). Darwin will read and analyze the content of each document to extract key information and build a detailed demand package presenting your case.
          </AlertDescription>
        </Alert>

        {/* Selection Tabs */}
        <Tabs defaultValue="documents" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents" className="gap-2">
              <File className="h-4 w-4" />
              Evidence Documents ({selectedFiles.size}/{files.length})
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-2">
              <Camera className="h-4 w-4" />
              Photos ({selectedPhotos.size}/{photos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {files.length === 0 ? 'No PDF documents uploaded' : `${files.length} PDF documents available for analysis`}
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

            {files.length > 0 ? (
              <ScrollArea className="h-[280px] border rounded-md p-3">
                <div className="space-y-2">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedFiles.has(file.id) ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => toggleFile(file.id)}
                    >
                      <Checkbox
                        checked={selectedFiles.has(file.id)}
                        onCheckedChange={() => toggleFile(file.id)}
                      />
                      <FolderOpen className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="overflow-hidden flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.file_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {file.folder_name && (
                            <span className="bg-muted px-1.5 py-0.5 rounded">{file.folder_name}</span>
                          )}
                          <span>{file.uploaded_at ? format(new Date(file.uploaded_at), 'MMM d, yyyy') : 'Unknown date'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="border rounded-md p-8 text-center text-muted-foreground">
                <File className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No PDF documents found in this claim.</p>
                <p className="text-xs mt-1">Upload evidence documents to the claim files first.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="photos" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {photos.length === 0 ? 'No photos uploaded' : `${photos.length} photos available (optional - include if relevant)`}
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

            {photos.length > 0 ? (
              <ScrollArea className="h-[280px] border rounded-md p-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {photos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className={`flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50 ${
                        selectedPhotos.has(photo.id) ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => togglePhoto(photo.id)}
                    >
                      <Checkbox
                        checked={selectedPhotos.has(photo.id)}
                        onCheckedChange={() => togglePhoto(photo.id)}
                      />
                      <Camera className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="overflow-hidden flex-1 min-w-0">
                        <p className="text-xs truncate">Photo {idx + 1}</p>
                        {photo.category && (
                          <p className="text-xs text-muted-foreground truncate">{photo.category}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="border rounded-md p-6 text-center text-muted-foreground">
                <Camera className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No photos uploaded to this claim.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Additional Instructions */}
        <div className="space-y-2">
          <Label>Case Strategy & Instructions (Optional)</Label>
          <Textarea
            placeholder="Provide any specific arguments, case strategy notes, or areas to emphasize in the demand package..."
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Tell Darwin what to focus on, any specific arguments to make, or context that will help build a stronger case.
          </p>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={loading || selectedFiles.size === 0}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing Documents & Building Case...
            </>
          ) : (
            <>
              <Briefcase className="h-4 w-4 mr-2" />
              Generate Demand Package ({selectedFiles.size} documents{selectedPhotos.size > 0 ? `, ${selectedPhotos.size} photos` : ''})
            </>
          )}
        </Button>

        {/* Generated Package */}
        {generatedPackage && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Generated Demand Package</Label>
              {lastPackageDate && (
                <span className="text-xs text-muted-foreground">
                  Generated: {format(new Date(lastPackageDate), 'MMM d, yyyy h:mm a')}
                </span>
              )}
            </div>
            
            <ScrollArea className="h-[400px] border rounded-md p-4 bg-muted/30">
              <pre className="whitespace-pre-wrap text-sm font-mono">{generatedPackage}</pre>
            </ScrollArea>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={downloadAsText}>
                <Download className="h-4 w-4 mr-1" />
                Download Text
              </Button>
              <Button variant="outline" size="sm" onClick={saveAsWord}>
                <FileText className="h-4 w-4 mr-1" />
                Save as Word
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
