import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Camera, 
  Loader2, 
  Sparkles, 
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Calculator,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ClaimPhoto {
  id: string;
  file_name: string;
  file_path: string;
  category: string | null;
  description: string | null;
  ai_material_type?: string | null;
  ai_condition_rating?: string | null;
  ai_detected_damages?: any;
  ai_analysis_summary?: string | null;
  ai_analyzed_at?: string | null;
}

interface XactimateLineItem {
  category: string;
  xactimate_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total: number;
  justification: string;
}

// Format compatible with EnhancedEstimateBuilder
interface EstimateLineItem {
  id: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  xactimateCode?: string;
  justification?: string;
}

interface AnalysisResult {
  summary: string;
  total_estimated_rcv: number;
  line_items: XactimateLineItem[];
  measurement_notes?: string;
  additional_items_to_verify?: string[];
}

interface PhotoToXactimateAnalysisProps {
  claimId: string;
  onLineItemsGenerated: (items: EstimateLineItem[]) => void;
}

export const PhotoToXactimateAnalysis = ({ claimId, onLineItemsGenerated }: PhotoToXactimateAnalysisProps) => {
  const [photos, setPhotos] = useState<ClaimPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  // Measurement inputs
  const [roofArea, setRoofArea] = useState("");
  const [pitch, setPitch] = useState("");
  const [stories, setStories] = useState("");

  useEffect(() => {
    fetchPhotos();
  }, [claimId]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("claim_photos")
        .select("id, file_name, file_path, category, description, ai_material_type, ai_condition_rating, ai_detected_damages, ai_analysis_summary, ai_analyzed_at")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setPhotos((data || []) as ClaimPhoto[]);
    } catch (error) {
      console.error("Error fetching photos:", error);
      toast.error("Failed to load photos");
    } finally {
      setLoading(false);
    }
  };

  const togglePhoto = (photoId: string) => {
    const newSelected = new Set(selectedPhotoIds);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotoIds(newSelected);
  };

  const selectAll = () => {
    setSelectedPhotoIds(new Set(photos.map(p => p.id)));
  };

  const selectNone = () => {
    setSelectedPhotoIds(new Set());
  };

  const selectAnalyzed = () => {
    setSelectedPhotoIds(new Set(photos.filter(p => p.ai_analyzed_at).map(p => p.id)));
  };

  const getConditionBadge = (rating: string | null) => {
    if (!rating) return null;
    const variants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      excellent: "default",
      good: "default",
      fair: "secondary",
      poor: "outline",
      failed: "destructive",
    };
    return (
      <Badge variant={variants[rating.toLowerCase()] || "secondary"}>
        {rating}
      </Badge>
    );
  };

  const analyzePhotos = async () => {
    if (selectedPhotoIds.size === 0) {
      toast.error("Please select at least one photo");
      return;
    }

    setAnalyzing(true);
    setResult(null);

    try {
      // Get signed URLs for selected photos
      const selectedPhotos = photos.filter(p => selectedPhotoIds.has(p.id));
      const photoUrls: string[] = [];
      const photoDescriptions: string[] = [];
      const existingAnalysis: any[] = [];

      for (const photo of selectedPhotos) {
        const { data: signedUrlData } = await supabase.storage
          .from("claim-files")
          .createSignedUrl(photo.file_path, 3600);
        
        if (signedUrlData?.signedUrl) {
          photoUrls.push(signedUrlData.signedUrl);
          photoDescriptions.push(photo.description || "");
          
          if (photo.ai_material_type || photo.ai_condition_rating) {
            existingAnalysis.push({
              file_name: photo.file_name,
              ai_material_type: photo.ai_material_type,
              ai_condition_rating: photo.ai_condition_rating,
              ai_detected_damages: photo.ai_detected_damages,
              ai_analysis_summary: photo.ai_analysis_summary,
            });
          }
        }
      }

      if (photoUrls.length === 0) {
        toast.error("Could not access photo files");
        return;
      }

      // Build measurement data if provided
      const measurementData = (roofArea || pitch || stories) ? {
        roofArea: roofArea || null,
        pitch: pitch || null,
        stories: stories || null,
      } : null;

      // Call the darwin-ai-analysis function
      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId,
          analysisType: "photo_to_xactimate",
          additionalContext: {
            photoUrls,
            photoDescriptions,
            existingAnalysis,
            measurementData,
          },
        },
      });

      if (error) throw error;

      // Parse the result
      let analysisResult: AnalysisResult | null = null;
      
      if (data?.result) {
        try {
          // Try to parse JSON from the result
          let jsonStr = data.result;
          if (jsonStr.includes("```json")) {
            jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
          }
          if (jsonStr.includes("```")) {
            jsonStr = jsonStr.replace(/```\n?/g, "");
          }
          analysisResult = JSON.parse(jsonStr.trim());
        } catch (parseError) {
          console.error("Failed to parse analysis result:", parseError);
          toast.error("Could not parse line items - please try again");
          return;
        }
      }

      if (analysisResult) {
        setResult(analysisResult);
        toast.success(`Generated ${analysisResult.line_items?.length || 0} Xactimate line items`);
      }

    } catch (error: any) {
      console.error("Error analyzing photos:", error);
      toast.error(error.message || "Failed to analyze photos");
    } finally {
      setAnalyzing(false);
    }
  };

  const applyLineItems = () => {
    if (result?.line_items) {
      // Convert to the format expected by EnhancedEstimateBuilder
      const items: EstimateLineItem[] = result.line_items.map((item, idx) => ({
        id: `photo-${Date.now()}-${idx}`,
        category: item.category,
        description: item.description,
        xactimateCode: item.xactimate_code,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
        justification: item.justification,
      }));
      onLineItemsGenerated(items);
      toast.success(`Applied ${items.length} line items to estimate`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading photos...
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No photos uploaded for this claim</p>
        <p className="text-sm">Upload photos in the Photos tab first</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Photo Selection */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Select Photos to Analyze ({selectedPhotoIds.size} selected)
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>All</Button>
              <Button variant="ghost" size="sm" onClick={selectNone}>None</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[200px]">
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => togglePhoto(photo.id)}
                  className={`flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                    selectedPhotoIds.has(photo.id) 
                      ? "bg-primary/10 border border-primary/30" 
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={selectedPhotoIds.has(photo.id)}
                    onCheckedChange={() => togglePhoto(photo.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <ImageIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium truncate">{photo.file_name}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {photo.ai_condition_rating && getConditionBadge(photo.ai_condition_rating)}
                      {photo.ai_material_type && (
                        <span className="text-xs text-muted-foreground truncate">
                          {photo.ai_material_type}
                        </span>
                      )}
                    </div>
                    {photo.category && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        {photo.category}
                      </Badge>
                    )}
                  </div>
                  {photo.ai_analysis_summary && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">{photo.ai_analysis_summary}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Optional Measurements */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Measurements (Optional)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    Providing measurements improves quantity accuracy. Without them, Darwin will estimate from visible damage.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Roof Area (SQ)</Label>
              <Input
                type="number"
                placeholder="e.g., 25"
                value={roofArea}
                onChange={(e) => setRoofArea(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Pitch</Label>
              <Input
                placeholder="e.g., 6/12"
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Stories</Label>
              <Input
                type="number"
                placeholder="e.g., 2"
                value={stories}
                onChange={(e) => setStories(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analyze Button */}
      <Button
        onClick={analyzePhotos}
        disabled={analyzing || selectedPhotoIds.size === 0}
        className="w-full gap-2"
      >
        {analyzing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing {selectedPhotoIds.size} photos...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate Xactimate Line Items from Photos
          </>
        )}
      </Button>

      {/* Results */}
      {result && (
        <Card className="border-primary/30">
          <CardHeader className="py-3 bg-primary/5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                Analysis Complete
              </CardTitle>
              <Badge variant="default">
                ${result.total_estimated_rcv?.toLocaleString() || 0} RCV
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">{result.summary}</p>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {result.line_items?.length || 0} Line Items Generated
                </span>
                <Button size="sm" onClick={applyLineItems} className="gap-1">
                  <Calculator className="h-3 w-3" />
                  Apply to Estimate
                </Button>
              </div>
              
              <ScrollArea className="h-[200px] border rounded-md">
                <div className="p-2 space-y-2">
                  {result.line_items?.map((item, idx) => (
                    <div key={idx} className="p-2 bg-muted/50 rounded text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{item.description}</span>
                        <span className="font-bold">${item.total?.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{item.xactimate_code}</Badge>
                        <span>{item.quantity} {item.unit} @ ${item.unit_price?.toFixed(2)}</span>
                      </div>
                      <p className="text-muted-foreground italic">{item.justification}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {result.measurement_notes && (
              <div className="p-2 bg-accent/50 border border-accent rounded text-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-accent-foreground mt-0.5" />
                  <div>
                    <span className="font-medium">Measurement Notes:</span>
                    <p className="text-muted-foreground">{result.measurement_notes}</p>
                  </div>
                </div>
              </div>
            )}

            {result.additional_items_to_verify?.length > 0 && (
              <div className="p-2 bg-muted border border-border rounded text-xs">
                <span className="font-medium">Items to Verify On-Site:</span>
                <ul className="list-disc list-inside text-muted-foreground mt-1">
                  {result.additional_items_to_verify.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
