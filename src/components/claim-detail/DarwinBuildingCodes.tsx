import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Building, Search, Copy, Loader2, BookOpen, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BuildingCodesProps {
  claimId: string;
  claim: any;
}

interface CodeCitation {
  id: string;
  code_source: string;
  code_year: string;
  section_number: string;
  section_title: string | null;
  content: string;
  keywords: string[] | null;
  state_adoptions: string[] | null;
}

interface ManufacturerSpec {
  id: string;
  manufacturer: string;
  product_category: string;
  product_name: string | null;
  spec_type: string;
  content: string;
  source_url: string | null;
  keywords: string[] | null;
}

export function DarwinBuildingCodes({ claimId, claim }: BuildingCodesProps) {
  const [activeTab, setActiveTab] = useState("codes");
  const [searchTerm, setSearchTerm] = useState("");
  const [codes, setCodes] = useState<CodeCitation[]>([]);
  const [specs, setSpecs] = useState<ManufacturerSpec[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Detect state
      const stateCode = claim.policyholder_address?.toUpperCase().includes("PA") ? "PA" : "NJ";

      // Fetch building codes for this state
      const { data: codesData } = await supabase
        .from("building_code_citations")
        .select("*")
        .contains("state_adoptions", [stateCode])
        .order("code_source", { ascending: true });

      setCodes(codesData || []);

      // Fetch manufacturer specs
      const { data: specsData } = await supabase
        .from("manufacturer_specs")
        .select("*")
        .order("manufacturer", { ascending: true });

      setSpecs(specsData || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const searchCodes = async () => {
    if (!searchTerm.trim()) return;
    
    setIsSearching(true);
    try {
      const stateCode = claim.policyholder_address?.toUpperCase().includes("PA") ? "PA" : "NJ";
      
      // Search codes by keywords or content
      const { data: codesData } = await supabase
        .from("building_code_citations")
        .select("*")
        .contains("state_adoptions", [stateCode])
        .or(`content.ilike.%${searchTerm}%,section_title.ilike.%${searchTerm}%`);

      setCodes(codesData || []);

      // Search specs
      const { data: specsData } = await supabase
        .from("manufacturer_specs")
        .select("*")
        .or(`content.ilike.%${searchTerm}%,manufacturer.ilike.%${searchTerm}%,product_name.ilike.%${searchTerm}%`);

      setSpecs(specsData || []);

      toast({ title: "Search Complete", description: `Found ${codesData?.length || 0} codes and ${specsData?.length || 0} specs.` });
    } catch (error: any) {
      console.error("Error searching:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const aiLookup = async () => {
    setIsSearching(true);
    setAiResult(null);
    try {
      const response = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId,
          analysisType: "code_lookup",
          content: searchTerm,
          additionalContext: {
            lossType: claim.loss_type,
            lossDescription: claim.loss_description,
          },
        },
      });

      if (response.error) throw response.error;

      const result = response.data?.result || response.data?.analysis;
      if (result) {
        setAiResult(result);
        toast({ 
          title: "AI Code Lookup Complete", 
          description: "Found relevant codes and recommendations.",
        });
      } else {
        toast({ 
          title: "AI Code Lookup", 
          description: "No specific codes found for this query.",
        });
      }
    } catch (error: any) {
      console.error("Error in AI lookup:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Building Codes & Manufacturer Specs</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search Bar */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search codes, specs, manufacturers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCodes()}
              className="pl-9"
            />
          </div>
          <Button onClick={searchCodes} disabled={isSearching || !searchTerm.trim()}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
          <Button variant="outline" onClick={aiLookup} disabled={isSearching || !searchTerm.trim()}>
            AI Lookup
          </Button>
        </div>

        {/* AI Result Display */}
        {aiResult && (
          <Card className="mb-4 bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  AI Code Lookup Results
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setAiResult(null)}
                  className="h-6 px-2 text-xs"
                >
                  Dismiss
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[300px]">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-sm whitespace-pre-wrap">{aiResult}</p>
                </div>
              </ScrollArea>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => copyToClipboard(aiResult, "AI Analysis")}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-col sm:flex-row w-full h-auto gap-1 p-1">
            <TabsTrigger value="codes" className="w-full justify-start gap-2 px-3 py-2">
              <BookOpen className="h-4 w-4 flex-shrink-0" />
              <span>Building Codes ({codes.length})</span>
            </TabsTrigger>
            <TabsTrigger value="specs" className="w-full justify-start gap-2 px-3 py-2">
              <Building className="h-4 w-4 flex-shrink-0" />
              <span>Manufacturer Specs ({specs.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="codes" className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : codes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No building codes found.</p>
                <p className="text-sm">Search for specific codes or add them in Settings.</p>
              </div>
            ) : (
              <ScrollArea className="h-[350px]">
                <div className="space-y-3">
                  {codes.map((code) => (
                    <div key={code.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge>{code.code_source}</Badge>
                          <Badge variant="outline">{code.code_year}</Badge>
                          <span className="font-medium text-sm">{code.section_number}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(
                            `${code.code_source} ${code.code_year} ${code.section_number}: ${code.content}`,
                            "Citation"
                          )}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      {code.section_title && (
                        <div className="font-medium text-sm mb-1">{code.section_title}</div>
                      )}
                      <p className="text-sm text-muted-foreground">{code.content}</p>
                      {code.keywords && code.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {code.keywords.map((kw, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">{kw}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="specs" className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : specs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No manufacturer specs found.</p>
                <p className="text-sm">Search for specific products or manufacturers.</p>
              </div>
            ) : (
              <ScrollArea className="h-[350px]">
                <div className="space-y-3">
                  {specs.map((spec) => (
                    <div key={spec.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">{spec.manufacturer}</Badge>
                          <Badge variant="outline">{spec.product_category}</Badge>
                          {spec.product_name && (
                            <span className="text-sm font-medium">{spec.product_name}</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(
                            `${spec.manufacturer} ${spec.product_name || spec.product_category} - ${spec.spec_type}: ${spec.content}`,
                            "Spec"
                          )}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <Badge variant="secondary" className="mb-2">{spec.spec_type}</Badge>
                      <p className="text-sm text-muted-foreground">{spec.content}</p>
                      {spec.source_url && (
                        <a 
                          href={spec.source_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-primary hover:underline mt-2 inline-block"
                        >
                          View source →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default DarwinBuildingCodes;
