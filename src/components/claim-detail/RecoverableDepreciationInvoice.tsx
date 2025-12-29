import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Image, Loader2, Download, Camera, File, CheckSquare, DollarSign, Package, Send } from "lucide-react";
import { format } from "date-fns";

interface RecoverableDepreciationInvoiceProps {
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
  folder_name?: string;
  uploaded_at: string | null;
}

interface Settlement {
  id: string;
  recoverable_depreciation: number;
  replacement_cost_value: number;
  deductible: number;
  non_recoverable_depreciation: number;
  total_settlement: number | null;
  estimate_amount: number | null;
  pwi_recoverable_depreciation?: number;
  other_structures_recoverable_depreciation?: number;
}

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return "$0.00";
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const RecoverableDepreciationInvoice = ({ claimId, claim }: RecoverableDepreciationInvoiceProps) => {
  const [photos, setPhotos] = useState<ClaimPhoto[]>([]);
  const [files, setFiles] = useState<ClaimFile[]>([]);
  const [allFiles, setAllFiles] = useState<ClaimFile[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [generatedPackageUrl, setGeneratedPackageUrl] = useState<string | null>(null);
  
  // Invoice form data
  const [invoiceData, setInvoiceData] = useState({
    invoiceNumber: `RD-${Date.now().toString().slice(-8)}`,
    invoiceDate: format(new Date(), "yyyy-MM-dd"),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    notes: "Request for release of recoverable depreciation upon completion of repairs.",
  });

  useEffect(() => {
    loadData();
  }, [claimId]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      // Load settlement data
      const { data: settlementData, error: settlementError } = await supabase
        .from('claim_settlements')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (settlementError && settlementError.code !== 'PGRST116') {
        console.error('Error loading settlement:', settlementError);
      }
      setSettlement(settlementData);

      // Load photos
      const { data: photosData, error: photosError } = await supabase
        .from('claim_photos')
        .select('id, file_name, file_path, category, description, created_at')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });

      if (photosError) throw photosError;
      setPhotos(photosData || []);

      // Load folders to find Certificate of Completion folder
      const { data: foldersData, error: foldersError } = await supabase
        .from('claim_folders')
        .select('id, name')
        .eq('claim_id', claimId);

      if (foldersError) throw foldersError;

      const certFolder = foldersData?.find(f => f.name.toLowerCase().includes('certificate'));
      
      // Load files from Certificate of Completion folder
      const { data: filesData, error: filesError } = await supabase
        .from('claim_files')
        .select('id, file_name, file_path, file_type, folder_id, uploaded_at')
        .eq('claim_id', claimId)
        .order('uploaded_at', { ascending: false });

      if (filesError) throw filesError;
      
      // Add folder names to files
      const filesWithFolders = (filesData || []).map(file => {
        const folder = foldersData?.find(f => f.id === file.folder_id);
        return { ...file, folder_name: folder?.name };
      });
      
      setAllFiles(filesWithFolders);
      
      // Filter to Certificate of Completion folder files only
      if (certFolder) {
        const certFiles = filesWithFolders.filter(f => f.folder_id === certFolder.id);
        setFiles(certFiles);
      } else {
        // If no cert folder, show all files
        setFiles(filesWithFolders);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load claim data');
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

  // Calculate total recoverable depreciation
  const getTotalRecoverableDepreciation = (): number => {
    if (!settlement) return 0;
    const main = Number(settlement.recoverable_depreciation) || 0;
    const pwi = Number(settlement.pwi_recoverable_depreciation) || 0;
    const other = Number(settlement.other_structures_recoverable_depreciation) || 0;
    return main + pwi + other;
  };

  const handleGeneratePackage = async () => {
    if (!settlement) {
      toast.error('No settlement data found. Please add settlement information first.');
      return;
    }

    const totalRD = getTotalRecoverableDepreciation();
    if (totalRD <= 0) {
      toast.error('No recoverable depreciation amount to invoice.');
      return;
    }

    setLoading(true);
    try {
      // Generate the invoice
      const lineItems = [
        {
          description: `Recoverable Depreciation - Claim #${claim.claim_number || 'N/A'}`,
          quantity: 1,
          unitPrice: totalRD,
        }
      ];

      // Add breakdown items as informational
      if (settlement.recoverable_depreciation && settlement.recoverable_depreciation > 0) {
        lineItems.push({
          description: '  - Dwelling/Structure Recoverable Depreciation',
          quantity: 1,
          unitPrice: 0, // Informational only
        });
      }
      if (settlement.pwi_recoverable_depreciation && settlement.pwi_recoverable_depreciation > 0) {
        lineItems.push({
          description: '  - Personal Property/Contents Recoverable Depreciation',
          quantity: 1,
          unitPrice: 0,
        });
      }
      if (settlement.other_structures_recoverable_depreciation && settlement.other_structures_recoverable_depreciation > 0) {
        lineItems.push({
          description: '  - Other Structures Recoverable Depreciation',
          quantity: 1,
          unitPrice: 0,
        });
      }

      const { data: invoiceResult, error: invoiceError } = await supabase.functions.invoke("generate-invoice", {
        body: {
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: invoiceData.invoiceDate,
          dueDate: invoiceData.dueDate,
          recipient: {
            name: claim.insurance_company || 'Insurance Company',
            email: claim.insurance_email || '',
            address: '',
          },
          lineItems: lineItems.filter(item => item.unitPrice > 0),
          subtotal: totalRD,
          notes: invoiceData.notes,
          claimNumber: claim.claim_number,
          claimId,
        },
      });

      if (invoiceError) throw invoiceError;

      setGeneratedPackageUrl(invoiceResult?.pdfUrl);
      toast.success('Invoice generated successfully!');

      // Log the selected photos and files count
      console.log(`Package includes: Invoice + ${selectedPhotos.size} photos + ${selectedFiles.size} documents`);

    } catch (error: any) {
      console.error('Error generating package:', error);
      toast.error(error.message || 'Failed to generate invoice package');
    } finally {
      setLoading(false);
    }
  };

  const downloadInvoice = () => {
    if (generatedPackageUrl) {
      fetch(generatedPackageUrl)
        .then(res => res.text())
        .then(html => {
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
          }
        })
        .catch(() => {
          window.open(generatedPackageUrl, "_blank");
        });
    }
  };

  const downloadSelectedFiles = async () => {
    if (selectedFiles.size === 0 && selectedPhotos.size === 0) {
      toast.error('No files or photos selected');
      return;
    }

    toast.info(`Opening ${selectedPhotos.size} photos and ${selectedFiles.size} documents...`);
    
    // Download selected files
    for (const fileId of selectedFiles) {
      const file = files.find(f => f.id === fileId);
      if (file) {
        const { data } = await supabase.storage
          .from('claim-files')
          .createSignedUrl(file.file_path, 3600);
        if (data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
        }
      }
    }

    // Download selected photos
    for (const photoId of selectedPhotos) {
      const photo = photos.find(p => p.id === photoId);
      if (photo) {
        const { data } = await supabase.storage
          .from('claim-photos')
          .createSignedUrl(photo.file_path, 3600);
        if (data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
        }
      }
    }
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

  const totalRD = getTotalRecoverableDepreciation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Recoverable Depreciation Invoice
        </CardTitle>
        <CardDescription>
          Generate final invoice for recoverable depreciation with Certificate of Completion documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Settlement Summary */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-3">
          <h3 className="font-medium flex items-center gap-2">
            <Package className="h-4 w-4" />
            Settlement Summary
          </h3>
          {settlement ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Dwelling RD</p>
                <p className="font-semibold">{formatCurrency(settlement.recoverable_depreciation)}</p>
              </div>
              {settlement.pwi_recoverable_depreciation && settlement.pwi_recoverable_depreciation > 0 && (
                <div>
                  <p className="text-muted-foreground">Contents RD</p>
                  <p className="font-semibold">{formatCurrency(settlement.pwi_recoverable_depreciation)}</p>
                </div>
              )}
              {settlement.other_structures_recoverable_depreciation && settlement.other_structures_recoverable_depreciation > 0 && (
                <div>
                  <p className="text-muted-foreground">Other Structures RD</p>
                  <p className="font-semibold">{formatCurrency(settlement.other_structures_recoverable_depreciation)}</p>
                </div>
              )}
              <div className="col-span-2 md:col-span-1 border-l pl-4">
                <p className="text-muted-foreground">Total Recoverable</p>
                <p className="font-bold text-lg text-primary">{formatCurrency(totalRD)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No settlement data found. Please add settlement information in the Accounting tab first.
            </p>
          )}
        </div>

        {/* Invoice Details */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Invoice Number</Label>
            <Input
              value={invoiceData.invoiceNumber}
              onChange={(e) => setInvoiceData({ ...invoiceData, invoiceNumber: e.target.value })}
            />
          </div>
          <div>
            <Label>Invoice Date</Label>
            <Input
              type="date"
              value={invoiceData.invoiceDate}
              onChange={(e) => setInvoiceData({ ...invoiceData, invoiceDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Due Date</Label>
            <Input
              type="date"
              value={invoiceData.dueDate}
              onChange={(e) => setInvoiceData({ ...invoiceData, dueDate: e.target.value })}
            />
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea
            value={invoiceData.notes}
            onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
            rows={2}
            placeholder="Additional notes for the invoice..."
          />
        </div>

        {/* Document Selection Tabs */}
        <Tabs defaultValue="documents" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents" className="gap-2">
              <File className="h-4 w-4" />
              Certificate Docs ({selectedFiles.size}/{files.length})
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-2">
              <Camera className="h-4 w-4" />
              Photos ({selectedPhotos.size}/{photos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {files.length === 0 ? 'No documents in Certificate of Completion folder' : `${files.length} documents available`}
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
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="overflow-hidden flex-1 min-w-0">
                        <p className="text-sm truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.folder_name} • {file.uploaded_at ? format(new Date(file.uploaded_at), 'MMM d, yyyy') : 'Unknown date'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

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
        </Tabs>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button
            onClick={handleGeneratePackage}
            disabled={loading || !settlement || totalRD <= 0}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Invoice...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate Invoice ({formatCurrency(totalRD)})
              </>
            )}
          </Button>

          {(selectedFiles.size > 0 || selectedPhotos.size > 0) && (
            <Button variant="outline" onClick={downloadSelectedFiles}>
              <Download className="h-4 w-4 mr-2" />
              Download Selected ({selectedFiles.size + selectedPhotos.size})
            </Button>
          )}
        </div>

        {/* Generated Invoice */}
        {generatedPackageUrl && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">Invoice Generated!</span>
              </div>
              <Button variant="outline" size="sm" onClick={downloadInvoice}>
                <Download className="h-4 w-4 mr-2" />
                View/Print Invoice
              </Button>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300">
              Invoice created for {formatCurrency(totalRD)}. Download the selected photos and documents to compile your complete RD release package.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
