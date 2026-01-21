import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Camera, Link2, Loader2, RefreshCw, Sparkles, Unlink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PhotoLinkerProps {
  claimId: string;
  claim: any;
}

interface Photo {
  id: string;
  file_name: string;
  file_path: string;
  category: string | null;
  description: string | null;
}

interface LineItem {
  index: number;
  description: string;
  amount?: number;
}

interface PhotoLink {
  id: string;
  photo_id: string;
  line_item_index: number;
  line_item_description: string;
  confidence_score: number;
  match_type: string;
}

export function DarwinPhotoLinker({ claimId, claim }: PhotoLinkerProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [links, setLinks] = useState<PhotoLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [claimId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch photos
      const { data: photosData } = await supabase
        .from("claim_photos")
        .select("id, file_name, file_path, category, description")
        .eq("claim_id", claimId);
      
      setPhotos(photosData || []);

      // Fetch extracted line items
      const { data: extractedData } = await supabase
        .from("extracted_document_data")
        .select("line_items")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (extractedData?.line_items) {
        const items = extractedData.line_items as any[];
        setLineItems(items.map((item, idx) => ({
          index: idx,
          description: item.description || item.item || `Line ${idx + 1}`,
          amount: item.amount || item.rcv || item.total,
        })));
      }

      // Fetch existing links
      const { data: linksData } = await supabase
        .from("photo_line_item_links")
        .select("*");
      
      setLinks((linksData || []).filter(l => photos?.some(p => p.id === l.photo_id)));
    } catch (error: any) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const autoLinkPhotos = async () => {
    if (photos.length === 0 || lineItems.length === 0) {
      toast({ title: "Missing Data", description: "Need both photos and extracted line items to auto-link.", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId,
          analysisType: "photo_linking",
          additionalContext: {
            photos: photos.map(p => ({ id: p.id, name: p.file_name, category: p.category, description: p.description })),
            lineItems: lineItems,
          },
        },
      });

      if (response.error) throw response.error;

      const matches = response.data?.matches || [];
      
      // Insert the links
      const newLinks = matches.map((match: any) => ({
        photo_id: match.photo_id,
        line_item_index: match.line_item_index,
        line_item_description: lineItems[match.line_item_index]?.description || "",
        confidence_score: match.confidence || 0.8,
        match_type: "auto",
      }));

      if (newLinks.length > 0) {
        const { error } = await supabase.from("photo_line_item_links").insert(newLinks);
        if (error) throw error;
      }

      toast({ title: "Auto-Linking Complete", description: `Linked ${newLinks.length} photos to estimate line items.` });
      fetchData();
    } catch (error: any) {
      console.error("Error auto-linking:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const manualLink = async (photoId: string, lineItemIndex: number) => {
    try {
      const { error } = await supabase.from("photo_line_item_links").insert({
        photo_id: photoId,
        line_item_index: lineItemIndex,
        line_item_description: lineItems[lineItemIndex]?.description || "",
        confidence_score: 1.0,
        match_type: "manual",
      });

      if (error) throw error;

      toast({ title: "Linked" });
      fetchData();
      setSelectedPhoto(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const unlinkPhoto = async (linkId: string) => {
    try {
      const { error } = await supabase.from("photo_line_item_links").delete().eq("id", linkId);
      if (error) throw error;
      
      setLinks(prev => prev.filter(l => l.id !== linkId));
      toast({ title: "Unlinked" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getPhotoLinks = (photoId: string) => links.filter(l => l.photo_id === photoId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Photo-Document Linker</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={autoLinkPhotos} disabled={isAnalyzing || photos.length === 0 || lineItems.length === 0}>
              {isAnalyzing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Auto-Link with AI
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No photos uploaded yet.</p>
            <p className="text-sm">Upload photos in the Photos tab to link them to estimate items.</p>
          </div>
        ) : lineItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Link2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No extracted line items found.</p>
            <p className="text-sm">Use Smart Extraction above to parse an estimate first.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Photos List */}
            <div>
              <h4 className="font-medium mb-2 text-sm">Claim Photos ({photos.length})</h4>
              <ScrollArea className="h-[300px] border rounded-lg p-2">
                <div className="space-y-2">
                  {photos.map((photo) => {
                    const photoLinks = getPhotoLinks(photo.id);
                    const isSelected = selectedPhoto === photo.id;
                    
                    return (
                      <div 
                        key={photo.id} 
                        className={`p-2 border rounded-lg cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                        onClick={() => setSelectedPhoto(isSelected ? null : photo.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Camera className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">{photo.file_name}</span>
                          </div>
                          {photoLinks.length > 0 && (
                            <Badge variant="secondary" className="ml-2 flex-shrink-0">
                              {photoLinks.length} linked
                            </Badge>
                          )}
                        </div>
                        {photo.category && (
                          <div className="text-xs text-muted-foreground mt-1">{photo.category}</div>
                        )}
                        {photoLinks.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {photoLinks.map((link) => (
                              <div key={link.id} className="flex items-center justify-between text-xs bg-muted px-2 py-1 rounded">
                                <span className="truncate">{link.line_item_description}</span>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); unlinkPhoto(link.id); }}>
                                  <Unlink className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Line Items List */}
            <div>
              <h4 className="font-medium mb-2 text-sm">
                Estimate Line Items ({lineItems.length})
                {selectedPhoto && <span className="text-primary ml-2">— Click to link</span>}
              </h4>
              <ScrollArea className="h-[300px] border rounded-lg p-2">
                <div className="space-y-2">
                  {lineItems.map((item) => (
                    <div 
                      key={item.index} 
                      className={`p-2 border rounded-lg ${selectedPhoto ? "cursor-pointer hover:bg-primary/10 hover:border-primary" : ""}`}
                      onClick={() => selectedPhoto && manualLink(selectedPhoto, item.index)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{item.description}</span>
                        {item.amount && (
                          <span className="text-sm font-medium">${item.amount.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DarwinPhotoLinker;
