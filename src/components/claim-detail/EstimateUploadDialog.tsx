import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface EstimateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: string;
  onSuccess?: () => void;
}

interface ExtractedData {
  estimate_type: string | null;
  dwelling: {
    rcv: number;
    recoverable_depreciation: number;
    non_recoverable_depreciation: number;
    deductible: number;
  };
  other_structures: {
    rcv: number;
    recoverable_depreciation: number;
    non_recoverable_depreciation: number;
    deductible: number;
  };
  contents: {
    rcv: number;
    recoverable_depreciation: number;
    non_recoverable_depreciation: number;
  };
  totals: {
    gross_total: number;
    total_depreciation: number;
    net_total: number;
  };
  line_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_cost: number;
    total: number;
    category: string;
  }>;
}

export function EstimateUploadDialog({
  open,
  onOpenChange,
  claimId,
  onSuccess,
}: EstimateUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setExtractedData(null);
      setError(null);
    }
  };

  const handleExtract = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("claimId", claimId);

      const { data, error: fnError } = await supabase.functions.invoke("extract-estimate", {
        body: formData,
      });

      if (fnError) throw fnError;

      if (!data.success) {
        throw new Error(data.error || "Failed to extract estimate data");
      }

      setExtractedData(data.data);
      
      // Invalidate queries to refresh accounting data
      queryClient.invalidateQueries({ queryKey: ["claim-settlement", claimId] });

      toast({
        title: "Estimate processed successfully",
        description: "The accounting figures have been populated from the estimate.",
      });

      onSuccess?.();
    } catch (err) {
      console.error("Estimate extraction error:", err);
      setError(err instanceof Error ? err.message : "Failed to process estimate");
      toast({
        title: "Error",
        description: "Failed to extract estimate data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setExtractedData(null);
    setError(null);
    onOpenChange(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value || 0);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Estimate
          </DialogTitle>
          <DialogDescription>
            Upload an estimate (Xactimate, Symbility, or contractor estimate) and the financial figures will be automatically extracted and populated into accounting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="estimate-file">Select Estimate File</Label>
            <Input
              id="estimate-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            <p className="text-xs text-muted-foreground">
              Supported formats: PDF, PNG, JPG, TIFF
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Processing Status */}
          {isProcessing && (
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-medium">Processing estimate...</p>
                <p className="text-sm text-muted-foreground">
                  AI is extracting financial figures from your document
                </p>
              </div>
            </div>
          )}

          {/* Extracted Data Preview */}
          {extractedData && (
            <div className="space-y-4">
              <Alert className="border-primary/30 bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertDescription>
                  Successfully extracted data from {extractedData.estimate_type || "estimate"}
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Dwelling */}
                <div className="p-4 border rounded-lg space-y-2">
                  <h4 className="font-semibold">Dwelling</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RCV:</span>
                      <span>{formatCurrency(extractedData.dwelling?.rcv)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recoverable Dep:</span>
                      <span>{formatCurrency(extractedData.dwelling?.recoverable_depreciation)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Non-Rec Dep:</span>
                      <span>{formatCurrency(extractedData.dwelling?.non_recoverable_depreciation)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deductible:</span>
                      <span>{formatCurrency(extractedData.dwelling?.deductible)}</span>
                    </div>
                  </div>
                </div>

                {/* Other Structures */}
                <div className="p-4 border rounded-lg space-y-2">
                  <h4 className="font-semibold">Other Structures</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RCV:</span>
                      <span>{formatCurrency(extractedData.other_structures?.rcv)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recoverable Dep:</span>
                      <span>{formatCurrency(extractedData.other_structures?.recoverable_depreciation)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Non-Rec Dep:</span>
                      <span>{formatCurrency(extractedData.other_structures?.non_recoverable_depreciation)}</span>
                    </div>
                  </div>
                </div>

                {/* Contents */}
                <div className="p-4 border rounded-lg space-y-2">
                  <h4 className="font-semibold">Personal Property</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RCV:</span>
                      <span>{formatCurrency(extractedData.contents?.rcv)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recoverable Dep:</span>
                      <span>{formatCurrency(extractedData.contents?.recoverable_depreciation)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Non-Rec Dep:</span>
                      <span>{formatCurrency(extractedData.contents?.non_recoverable_depreciation)}</span>
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="p-4 border rounded-lg space-y-2 bg-muted/30">
                  <h4 className="font-semibold">Totals</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross Total:</span>
                      <span className="font-medium">{formatCurrency(extractedData.totals?.gross_total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Depreciation:</span>
                      <span>{formatCurrency(extractedData.totals?.total_depreciation)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-medium">Net Total:</span>
                      <span className="font-semibold text-primary">{formatCurrency(extractedData.totals?.net_total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Items Preview */}
              {extractedData.line_items && extractedData.line_items.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Line Items ({extractedData.line_items.length})</h4>
                  <div className="max-h-40 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2">Description</th>
                          <th className="text-right p-2">Qty</th>
                          <th className="text-right p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractedData.line_items.slice(0, 10).map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2 truncate max-w-[200px]">{item.description}</td>
                            <td className="p-2 text-right">{item.quantity} {item.unit}</td>
                            <td className="p-2 text-right">{formatCurrency(item.total)}</td>
                          </tr>
                        ))}
                        {extractedData.line_items.length > 10 && (
                          <tr className="border-t bg-muted/30">
                            <td colSpan={3} className="p-2 text-center text-muted-foreground">
                              +{extractedData.line_items.length - 10} more items
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              {extractedData ? "Close" : "Cancel"}
            </Button>
            {!extractedData && (
              <Button onClick={handleExtract} disabled={!file || isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Extract & Populate
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
