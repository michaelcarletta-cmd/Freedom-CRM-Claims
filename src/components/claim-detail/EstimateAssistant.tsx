import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calculator, Loader2, Copy, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LineItem {
  category: string;
  categoryCode: string;
  description: string;
  unit: string;
  quantityMin: number;
  quantityMax: number;
  severity: string;
  notes: string;
  photoReference?: string;
}

interface EstimateResult {
  summary: string;
  totalLineItems: number;
  lineItems: LineItem[];
  additionalNotes?: string;
}

interface Photo {
  id: string;
  file_name: string;
  category?: string;
  url?: string;
}

interface EstimateAssistantProps {
  claimId: string;
  photos: Photo[];
  photoUrls?: Record<string, string>;
}

const EstimateAssistant = ({ claimId, photos, photoUrls = {} }: EstimateAssistantProps) => {
  const [open, setOpen] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePhoto = (photoId: string) => {
    setSelectedPhotos(prev => 
      prev.includes(photoId) 
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  const selectAll = () => {
    if (selectedPhotos.length === photos.length) {
      setSelectedPhotos([]);
    } else {
      setSelectedPhotos(photos.map(p => p.id));
    }
  };

  const generateEstimate = async () => {
    if (selectedPhotos.length === 0) {
      toast.error("Please select at least one photo");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('estimate-assistant', {
        body: { photoIds: selectedPhotos, claimId }
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
      `${i + 1}. [${item.categoryCode}] ${item.description}\n   Unit: ${item.unit} | Qty: ${item.quantityMin}-${item.quantityMax} | Severity: ${item.severity}\n   Notes: ${item.notes}`
    ).join('\n\n');

    const fullText = `ESTIMATE LINE ITEMS\n${'='.repeat(50)}\n\nSummary: ${result.summary}\n\n${text}\n\n${result.additionalNotes ? `Additional Notes: ${result.additionalNotes}` : ''}`;
    
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
        <Button variant="outline" size="sm" className="gap-2">
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
          {/* Photo Selection */}
          {!result && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Select Photos to Analyze</CardTitle>
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    {selectedPhotos.length === photos.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No photos available. Upload photos first.</p>
                ) : (
                <ScrollArea className="h-64">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {photos.map(photo => {
                        const imageUrl = photo.url || photoUrls[photo.id];
                        const isSelected = selectedPhotos.includes(photo.id);
                        return (
                          <div 
                            key={photo.id} 
                            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground/30'
                            }`}
                            onClick={() => togglePhoto(photo.id)}
                          >
                            {imageUrl ? (
                              <img 
                                src={imageUrl} 
                                alt={photo.file_name}
                                className="w-full h-20 object-cover"
                              />
                            ) : (
                              <div className="w-full h-20 bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">No preview</span>
                              </div>
                            )}
                            <div className="absolute top-1 left-1">
                              <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => togglePhoto(photo.id)}
                                className="bg-background/80"
                              />
                            </div>
                            {photo.category && (
                              <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 py-0.5">
                                <span className="text-[10px] text-muted-foreground truncate block">{photo.category}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generate Button */}
          {!result && (
            <Button 
              onClick={generateEstimate} 
              disabled={loading || selectedPhotos.length === 0}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing {selectedPhotos.length} photo(s)...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Generate Xactimate Line Items ({selectedPhotos.length} selected)
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
                            <Badge variant={getSeverityColor(item.severity)}>
                              {item.severity}
                            </Badge>
                          </div>
                          
                          <p className="text-sm">{item.description}</p>
                          
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="bg-muted px-2 py-1 rounded">
                              Unit: {item.unit}
                            </span>
                            <span className="bg-muted px-2 py-1 rounded">
                              Qty: {item.quantityMin === item.quantityMax 
                                ? item.quantityMin 
                                : `${item.quantityMin}-${item.quantityMax}`}
                            </span>
                            {item.photoReference && (
                              <span className="bg-muted px-2 py-1 rounded">
                                Photo: {item.photoReference}
                              </span>
                            )}
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
                onClick={() => { setResult(null); setSelectedPhotos([]); }}
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
