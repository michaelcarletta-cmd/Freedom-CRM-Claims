import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calculator, 
  Loader2, 
  Sparkles, 
  Plus, 
  Trash2, 
  Download, 
  Upload,
  FileText,
  Copy,
  Image,
  FileCheck,
  Camera
} from "lucide-react";
import { PhotoToXactimateAnalysis } from "./PhotoToXactimateAnalysis";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EnhancedEstimateBuilderProps {
  claimId: string;
  claim: any;
}

interface LineItem {
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

interface RepairScope {
  area: string;
  damages: string[];
  repairMethod: string;
  materials: string[];
  laborHours: number;
  notes: string;
}

interface ClaimPhoto {
  id: string;
  file_name: string;
  file_path: string;
  category: string | null;
  description: string | null;
}

interface DarwinAnalysis {
  id: string;
  analysis_type: string;
  result: string;
  created_at: string;
}

export const EnhancedEstimateBuilder = ({ claimId, claim }: EnhancedEstimateBuilderProps) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("scope");
  const [loading, setLoading] = useState(false);
  const [generatingScope, setGeneratingScope] = useState(false);
  const [generatingEstimate, setGeneratingEstimate] = useState(false);
  
  const [repairScopes, setRepairScopes] = useState<RepairScope[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [measurementFile, setMeasurementFile] = useState<File | null>(null);
  const [scopeNotes, setScopeNotes] = useState("");
  
  // Photo and analysis data
  const [photos, setPhotos] = useState<ClaimPhoto[]>([]);
  const [darwinAnalyses, setDarwinAnalyses] = useState<DarwinAnalysis[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);

  // Fetch photos and Darwin analyses when dialog opens
  useEffect(() => {
    if (open) {
      fetchClaimContext();
    }
  }, [open, claimId]);

  const fetchClaimContext = async () => {
    setLoadingContext(true);
    try {
      // Fetch photos
      const { data: photosData } = await supabase
        .from("claim_photos")
        .select("id, file_name, file_path, category, description")
        .eq("claim_id", claimId);
      
      if (photosData) setPhotos(photosData);

      // Fetch Darwin analysis results
      const { data: analysesData } = await supabase
        .from("darwin_analysis_results")
        .select("id, analysis_type, result, created_at")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });
      
      if (analysesData) setDarwinAnalyses(analysesData);
    } catch (error) {
      console.error("Error fetching claim context:", error);
    } finally {
      setLoadingContext(false);
    }
  };

  const buildPhotoContext = () => {
    // Only include photos that have descriptions - these are the useful ones for scope generation
    const describedPhotos = photos.filter(p => p.description && p.description.trim().length > 0);
    if (describedPhotos.length === 0) return "";
    
    let context = "\n\nDOCUMENTED PHOTO EVIDENCE:\n";
    const categorizedPhotos: Record<string, ClaimPhoto[]> = {};
    
    describedPhotos.forEach(photo => {
      const cat = photo.category || "Uncategorized";
      if (!categorizedPhotos[cat]) categorizedPhotos[cat] = [];
      categorizedPhotos[cat].push(photo);
    });
    
    Object.entries(categorizedPhotos).forEach(([category, catPhotos]) => {
      context += `\n${category}:\n`;
      catPhotos.forEach((photo, i) => {
        context += `  - ${photo.description}\n`;
      });
    });
    
    return context;
  };

  const buildAnalysisContext = () => {
    if (darwinAnalyses.length === 0) return "";
    
    let context = "\n\nPREVIOUS DARWIN AI ANALYSES:\n";
    
    // Get most relevant analyses (damage, document compilation, etc.)
    const relevantTypes = ["damage_assessment", "document_compilation", "denial_analysis", "supplement_generation"];
    const relevantAnalyses = darwinAnalyses.filter(a => 
      relevantTypes.some(t => a.analysis_type.includes(t)) || 
      a.result.toLowerCase().includes("damage") ||
      a.result.toLowerCase().includes("slope") ||
      a.result.toLowerCase().includes("roof")
    ).slice(0, 3);
    
    if (relevantAnalyses.length === 0 && darwinAnalyses.length > 0) {
      // Fall back to most recent analyses
      relevantAnalyses.push(...darwinAnalyses.slice(0, 2));
    }
    
    relevantAnalyses.forEach(analysis => {
      context += `\n[${analysis.analysis_type.replace(/_/g, " ").toUpperCase()}]:\n`;
      // Truncate long analyses but keep enough context
      const truncated = analysis.result.length > 2000 
        ? analysis.result.substring(0, 2000) + "..." 
        : analysis.result;
      context += truncated + "\n";
    });
    
    return context;
  };

  const generateRepairScope = async () => {
    setGeneratingScope(true);
    try {
      const photoContext = buildPhotoContext();
      const analysisContext = buildAnalysisContext();
      
      const { data, error } = await supabase.functions.invoke("claims-ai-assistant", {
        body: {
          claimId: claimId,
          question: `Generate a detailed repair scope for this insurance claim. You MUST respond with ONLY a JSON array.

USE THIS EVIDENCE TO IDENTIFY DAMAGED AREAS:
${analysisContext || "(No previous Darwin analyses available - generate a reasonable scope based on typical storm damage)"}
${photoContext}

Based on the evidence above, generate repair scopes for each damaged area.

CRITICAL RULES:
1. Standard repair = FULL REPLACEMENT of each damaged slope/section, not partial repairs
2. Include realistic labor hours and materials
3. Be specific about areas (e.g., "North Slope", "East Elevation")

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
[
  {"area": "Main Roof - North Slope", "damages": ["hail impacts", "granule loss"], "repairMethod": "Full tear-off and replacement per manufacturer specs", "materials": ["3-tab shingles", "felt underlayment", "ice & water shield", "drip edge"], "laborHours": 16, "notes": "Evidence from photo analysis"},
  {"area": "Main Roof - South Slope", "damages": ["wind damage", "lifted shingles"], "repairMethod": "Full tear-off and replacement", "materials": ["3-tab shingles", "felt underlayment"], "laborHours": 12, "notes": "Based on damage assessment"}
]

OUTPUT ONLY THE JSON ARRAY. NO EXPLANATIONS.`,
          messages: [],
        },
      });

      if (error) throw error;

      // Try to parse JSON from response
      try {
        const jsonMatch = data.answer.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const scopes = JSON.parse(jsonMatch[0]);
          setRepairScopes(scopes);
          toast.success("Repair scope generated from photos and reports");
        } else {
          throw new Error("Could not parse scope data");
        }
      } catch (parseError) {
        // Create a single scope from the response
        setRepairScopes([{
          area: "General Scope",
          damages: [data.answer.substring(0, 500)],
          repairMethod: "See detailed analysis",
          materials: [],
          laborHours: 0,
          notes: data.answer,
        }]);
        toast.success("Scope analysis generated");
      }
    } catch (error: any) {
      console.error("Error generating scope:", error);
      toast.error(error.message || "Failed to generate repair scope");
    } finally {
      setGeneratingScope(false);
    }
  };

  const generateEstimateFromScope = async () => {
    if (repairScopes.length === 0) {
      toast.error("Please generate a repair scope first");
      return;
    }

    setGeneratingEstimate(true);
    try {
      const scopeSummary = repairScopes.map(s => 
        `${s.area}: ${s.damages.join(", ")} - ${s.repairMethod} | Materials: ${s.materials.join(", ")} | Labor: ${s.laborHours}hrs`
      ).join("\n");

      const { data, error } = await supabase.functions.invoke("claims-ai-assistant", {
        body: {
          claimId: claimId,
          question: `CRITICAL: You MUST respond with ONLY a JSON array. No explanation, no text before or after. Just the JSON array.

Generate Xactimate-style line items for this repair scope:

${scopeSummary}

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
[
  {"category": "Roofing", "description": "Remove composition shingles - 3 tab", "xactimateCode": "RFCMTRF", "unit": "SQ", "quantity": 25, "unitPrice": 45.00, "total": 1125.00},
  {"category": "Roofing", "description": "Composition shingles - 3 tab - 25yr - Install", "xactimateCode": "RFSNRTB", "unit": "SQ", "quantity": 25, "unitPrice": 285.00, "total": 7125.00}
]

Include ALL line items: tear-off, materials, labor, disposal, ice & water shield, drip edge, flashing, vents, and 10% overhead & profit. Use realistic current pricing.

REMEMBER: Output ONLY the JSON array. No explanations.`,
          messages: [],
        },
      });

      if (error) throw error;

      console.log("AI Response for estimate:", data.answer);

      try {
        // Try to find JSON array in response
        const jsonMatch = data.answer.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const items = JSON.parse(jsonMatch[0]).map((item: any, index: number) => ({
            ...item,
            id: `item-${index}`,
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            total: Number(item.total) || (Number(item.quantity) * Number(item.unitPrice)) || 0,
          }));
          setLineItems(items);
          setActiveTab("estimate");
          toast.success(`Generated ${items.length} line items`);
        } else {
          console.error("No JSON found in response:", data.answer);
          toast.error("AI did not return line items - try again");
        }
      } catch (parseError) {
        console.error("Parse error:", parseError, "Response:", data.answer);
        toast.error("Could not parse estimate - try again");
      }
    } catch (error: any) {
      console.error("Error generating estimate:", error);
      toast.error(error.message || "Failed to generate estimate");
    } finally {
      setGeneratingEstimate(false);
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      id: `item-${Date.now()}`,
      category: "",
      description: "",
      unit: "EA",
      quantity: 1,
      unitPrice: 0,
      total: 0,
    }]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unitPrice") {
          updated.total = updated.quantity * updated.unitPrice;
        }
        return updated;
      }
      return item;
    }));
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  const copyToClipboard = () => {
    const text = lineItems.map(item => 
      `${item.category}\t${item.description}\t${item.xactimateCode || ""}\t${item.quantity}\t${item.unit}\t$${item.unitPrice.toFixed(2)}\t$${item.total.toFixed(2)}`
    ).join("\n");
    
    navigator.clipboard.writeText(
      `Category\tDescription\tCode\tQty\tUnit\tUnit Price\tTotal\n${text}\n\nTOTAL:\t\t\t\t\t\t$${calculateTotal().toFixed(2)}`
    );
    toast.success("Estimate copied to clipboard");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please upload a PDF file");
        return;
      }
      setMeasurementFile(file);
      toast.success(`${file.name} ready for analysis`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calculator className="h-4 w-4" />
          Estimate Builder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Enhanced Estimate Builder
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="photos" className="gap-1">
              <Camera className="h-3 w-3" />
              Photos
            </TabsTrigger>
            <TabsTrigger value="scope">Repair Scope</TabsTrigger>
            <TabsTrigger value="estimate">Line Items</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="photos" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[500px] pr-4">
              <PhotoToXactimateAnalysis 
                claimId={claimId} 
                onLineItemsGenerated={(items) => {
                  setLineItems(prev => [...prev, ...items]);
                  setActiveTab("estimate");
                }}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="scope" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {/* Available Context */}
                <Card className="p-4 bg-muted/50">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />
                    Available Evidence
                  </h3>
                  {loadingContext ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading photos and reports...
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={photos.length > 0 ? "default" : "secondary"} className="gap-1">
                        <Image className="h-3 w-3" />
                        {photos.length} Photos
                      </Badge>
                      <Badge variant={darwinAnalyses.length > 0 ? "default" : "secondary"} className="gap-1">
                        <FileText className="h-3 w-3" />
                        {darwinAnalyses.length} Darwin Reports
                      </Badge>
                      {photos.length === 0 && darwinAnalyses.length === 0 && (
                        <span className="text-sm text-muted-foreground">
                          Upload photos or run Darwin analyses for more accurate scope
                        </span>
                      )}
                    </div>
                  )}
                  {photos.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Categories: {[...new Set(photos.map(p => p.category || "Uncategorized"))].join(", ")}
                    </div>
                  )}
                </Card>

                {/* Measurement Upload */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Measurement PDF (Optional)</h3>
                      <p className="text-sm text-muted-foreground">
                        Upload roof measurements for more accurate estimates
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="max-w-[200px]"
                      />
                    </div>
                  </div>
                  {measurementFile && (
                    <Badge variant="secondary" className="mt-2">
                      <FileText className="h-3 w-3 mr-1" />
                      {measurementFile.name}
                    </Badge>
                  )}
                </Card>

                {/* Generate Scope Button */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={generateRepairScope}
                    disabled={generatingScope || loadingContext}
                    className="gap-2"
                  >
                    {generatingScope ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {photos.length > 0 || darwinAnalyses.length > 0 
                      ? "Generate Scope from Evidence" 
                      : "Generate AI Repair Scope"}
                  </Button>
                  {repairScopes.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={generateEstimateFromScope}
                      disabled={generatingEstimate}
                      className="gap-2"
                    >
                      {generatingEstimate ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Calculator className="h-4 w-4" />
                      )}
                      Generate Estimate
                    </Button>
                  )}
                </div>

                {/* Repair Scopes */}
                {repairScopes.map((scope, index) => (
                  <Card key={index} className="p-4">
                    <h4 className="font-semibold text-primary mb-2">{scope.area}</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Damages:</span>
                        <ul className="list-disc list-inside ml-2">
                          {scope.damages.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      </div>
                      <div>
                        <span className="font-medium">Repair Method:</span> {scope.repairMethod}
                      </div>
                      {scope.materials.length > 0 && (
                        <div>
                          <span className="font-medium">Materials:</span> {scope.materials.join(", ")}
                        </div>
                      )}
                      {scope.laborHours > 0 && (
                        <div>
                          <span className="font-medium">Est. Labor:</span> {scope.laborHours} hours
                        </div>
                      )}
                      {scope.notes && (
                        <div className="text-muted-foreground italic">{scope.notes}</div>
                      )}
                    </div>
                  </Card>
                ))}

                {repairScopes.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {photos.length > 0 || darwinAnalyses.length > 0 
                      ? "Click \"Generate Scope from Evidence\" to analyze photos and reports"
                      : "Click \"Generate AI Repair Scope\" to analyze the claim and create a detailed repair scope"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="estimate" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={addLineItem} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Line Item
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                    <Copy className="h-4 w-4" />
                    Copy All
                  </Button>
                </div>

                {lineItems.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-2">
                        <Label className="text-xs">Category</Label>
                        <Input
                          value={item.category}
                          onChange={(e) => updateLineItem(item.id, "category", e.target.value)}
                          placeholder="Roofing"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-4">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                          placeholder="Remove & replace shingles"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Code</Label>
                        <Input
                          value={item.xactimateCode || ""}
                          onChange={(e) => updateLineItem(item.id, "xactimateCode", e.target.value)}
                          placeholder="RFSNRTB"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Unit</Label>
                        <Input
                          value={item.unit}
                          onChange={(e) => updateLineItem(item.id, "unit", e.target.value)}
                          placeholder="SQ"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Total</Label>
                        <div className="h-8 flex items-center font-medium text-sm">
                          ${item.total.toFixed(2)}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeLineItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}

                {lineItems.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Generate from repair scope or add line items manually
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="summary" className="flex-1">
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Estimate Summary</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">Claim Number:</span>
                    <div className="font-medium">{claim.claim_number || "N/A"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Policyholder:</span>
                    <div className="font-medium">{claim.policyholder_name || "N/A"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Property Address:</span>
                    <div className="font-medium">{claim.policyholder_address || "N/A"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Loss Type:</span>
                    <div className="font-medium">{claim.loss_type || "N/A"}</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <span className="text-muted-foreground">Total Line Items:</span>
                  <div className="font-medium">{lineItems.length}</div>
                </div>

                <div>
                  <span className="text-muted-foreground">Categories:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {[...new Set(lineItems.map(i => i.category).filter(Boolean))].map(cat => (
                      <Badge key={cat} variant="secondary">{cat}</Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold">Estimated Total:</span>
                  <span className="text-3xl font-bold text-primary">
                    ${calculateTotal().toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={copyToClipboard} className="gap-2">
                    <Copy className="h-4 w-4" />
                    Copy Estimate
                  </Button>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
