import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Loader2, Copy, AlertCircle, CheckCircle2, FileText, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LineItem {
  category: string;
  categoryCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  severity: string;
  notes: string;
}

interface EstimateResult {
  summary: string;
  totalLineItems: number;
  estimatedTotal: number;
  lineItems: LineItem[];
  additionalNotes?: string;
}

interface EstimateAssistantProps {
  claimId: string;
  claim?: any;
}

const EstimateAssistant = ({ claimId, claim }: EstimateAssistantProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measurementFile, setMeasurementFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error("Please upload a PDF file");
        return;
      }
      setMeasurementFile(file);
    }
  };

  const removeMeasurementFile = () => {
    setMeasurementFile(null);
  };

  const generateEstimate = async () => {
    if (!measurementFile) {
      toast.error("Please upload a measurement PDF");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Convert PDF to base64
      const arrayBuffer = await measurementFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const pdfBase64 = btoa(binary);

      const { data, error: fnError } = await supabase.functions.invoke('estimate-assistant', {
        body: { 
          claimId,
          measurementPdf: pdfBase64,
          measurementFileName: measurementFile.name,
          claimContext: {
            lossType: claim?.loss_type,
            lossDate: claim?.loss_date,
            lossDescription: claim?.loss_description,
            address: claim?.policyholder_address
          }
        }
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setResult(data.estimate);
      toast.success(`Generated ${data.estimate.totalLineItems} line item suggestions`);
    } catch (err: any) {
      console.error('Estimate generation error:', err);
      setError(err.message || 'Failed to generate estimate');
      toast.error(err.message || 'Failed to generate estimate');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    
    const text = result.lineItems.map((item, i) => 
      `${i + 1}. [${item.categoryCode}] ${item.description}\n   Unit: ${item.unit} | Qty: ${item.quantity} | Unit Price: $${item.unitPrice?.toFixed(2) || '0.00'} | Total: $${item.totalPrice?.toFixed(2) || '0.00'}\n   Notes: ${item.notes}`
    ).join('\n\n');

    const fullText = `ESTIMATE LINE ITEMS\n${'='.repeat(50)}\n\nSummary: ${result.summary}\n\nEstimated Total: $${result.estimatedTotal?.toLocaleString() || '0'}\n\n${text}\n\n${result.additionalNotes ? `Additional Notes: ${result.additionalNotes}` : ''}`;
    
    navigator.clipboard.writeText(fullText);
    toast.success("Copied to clipboard");
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'severe': return 'destructive';
      case 'moderate': return 'default';
      case 'minor': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Calculator className="h-4 w-4" />
          Estimate Assistant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            AI Estimate Assistant
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Measurement Upload */}
          {!result && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Upload Measurement PDF</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload a roof measurement PDF (from GAF QuickMeasure, EagleView, etc.) to generate Xactimate line item suggestions.
                </p>
                
                {!measurementFile ? (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <Label htmlFor="measurement-upload" className="cursor-pointer">
                      <span className="text-primary hover:underline">Click to upload</span>
                      <span className="text-muted-foreground"> or drag and drop</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">PDF files only</p>
                    <Input
                      id="measurement-upload"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{measurementFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(measurementFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={removeMeasurementFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generate Button */}
          {!result && (
            <Button 
              onClick={generateEstimate} 
              disabled={loading || !measurementFile}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing measurement data...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Generate Xactimate Line Items
                </>
              )}
            </Button>
          )}

          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Analysis Complete
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={copyToClipboard}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{result.summary}</p>
                </CardContent>
              </Card>

              {/* Estimated Total */}
              {result.estimatedTotal && (
                <Card className="bg-primary/10 border-primary/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Estimated Total</span>
                      <span className="text-xl font-bold text-primary">
                        ${result.estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Line Items */}
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {result.lineItems.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                {item.categoryCode}
                              </Badge>
                              <span className="font-medium text-sm">{item.category}</span>
                            </div>
                            <span className="font-semibold text-primary">
                              ${item.totalPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </div>
                          
                          <p className="text-sm">{item.description}</p>
                          
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="bg-muted px-2 py-1 rounded">
                              {item.quantity} {item.unit}
                            </span>
                            <span className="bg-muted px-2 py-1 rounded">
                              @ ${item.unitPrice?.toFixed(2) || '0.00'}/{item.unit}
                            </span>
                            <Badge variant={getSeverityColor(item.severity)} className="text-xs">
                              {item.severity}
                            </Badge>
                          </div>
                          
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>

              {/* Additional Notes */}
              {result.additionalNotes && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">
                      <strong>Additional Notes:</strong> {result.additionalNotes}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* New Analysis Button */}
              <Button 
                variant="outline" 
                onClick={() => { setResult(null); setMeasurementFile(null); }}
                className="w-full"
              >
                Start New Analysis
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EstimateAssistant;