import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Package, Loader2, Download, FileText, Image, Receipt, 
  FileCheck, Mail, Calendar, Brain, AlertTriangle, Scale,
  FileSearch, Sparkles
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

interface DarwinOneClickPackageProps {
  claimId: string;
  claim: any;
}

interface PackageComponent {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  available: boolean;
  count?: number;
}

interface DarwinAnalysis {
  id: string;
  analysis_type: string;
  input_summary: string | null;
  created_at: string;
  result: string;
}

const ANALYSIS_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  engineer_report_rebuttal: { label: "Engineer Report Rebuttal", icon: <Scale className="h-4 w-4" /> },
  denial_rebuttal: { label: "Denial Rebuttal", icon: <AlertTriangle className="h-4 w-4" /> },
  correspondence: { label: "Correspondence Analysis", icon: <Mail className="h-4 w-4" /> },
  supplement: { label: "Supplement Generator", icon: <FileSearch className="h-4 w-4" /> },
  demand_package: { label: "Demand Package", icon: <Package className="h-4 w-4" /> },
  weakness_detection: { label: "Weakness Detection", icon: <AlertTriangle className="h-4 w-4" /> },
  next_steps: { label: "Next Steps Analysis", icon: <Sparkles className="h-4 w-4" /> },
  context_notes: { label: "Context Notes", icon: <FileText className="h-4 w-4" /> },
};

export const DarwinOneClickPackage = ({ claimId, claim }: DarwinOneClickPackageProps) => {
  const { toast } = useToast();
  const [selectedComponents, setSelectedComponents] = useState<string[]>([
    "claim_summary",
    "photos",
    "documents",
    "settlement",
    "communications",
  ]);
  const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [packageUrl, setPackageUrl] = useState<string | null>(null);

  // Fetch component counts
  const { data: componentCounts } = useQuery({
    queryKey: ["package-components", claimId],
    queryFn: async () => {
      const [photos, files, emails, settlements, tasks, inspections] = await Promise.all([
        supabase.from("claim_photos").select("id", { count: "exact" }).eq("claim_id", claimId),
        supabase.from("claim_files").select("id", { count: "exact" }).eq("claim_id", claimId),
        supabase.from("emails").select("id", { count: "exact" }).eq("claim_id", claimId),
        supabase.from("claim_settlements").select("id", { count: "exact" }).eq("claim_id", claimId),
        supabase.from("tasks").select("id", { count: "exact" }).eq("claim_id", claimId),
        supabase.from("inspections").select("id", { count: "exact" }).eq("claim_id", claimId),
      ]);

      return {
        photos: photos.count || 0,
        files: files.count || 0,
        emails: emails.count || 0,
        settlements: settlements.count || 0,
        tasks: tasks.count || 0,
        inspections: inspections.count || 0,
      };
    },
  });

  // Fetch Darwin analysis results for this claim
  const { data: darwinAnalyses } = useQuery({
    queryKey: ["darwin-analyses", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("darwin_analysis_results")
        .select("id, analysis_type, input_summary, created_at, result")
        .eq("claim_id", claimId)
        .in("analysis_type", [
          "engineer_report_rebuttal",
          "denial_rebuttal",
          "correspondence",
          "supplement",
          "demand_package",
          "weakness_detection",
        ])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DarwinAnalysis[];
    },
  });

  const components: PackageComponent[] = [
    {
      id: "claim_summary",
      label: "AI Claim Summary",
      icon: <FileText className="h-4 w-4" />,
      description: "Darwin-generated claim overview and status",
      available: true,
    },
    {
      id: "photos",
      label: "Photos",
      icon: <Image className="h-4 w-4" />,
      description: "All claim photos with descriptions",
      available: (componentCounts?.photos || 0) > 0,
      count: componentCounts?.photos,
    },
    {
      id: "documents",
      label: "Documents",
      icon: <FileCheck className="h-4 w-4" />,
      description: "Uploaded files and reports",
      available: (componentCounts?.files || 0) > 0,
      count: componentCounts?.files,
    },
    {
      id: "settlement",
      label: "Settlement Data",
      icon: <Receipt className="h-4 w-4" />,
      description: "Financial summary and calculations",
      available: (componentCounts?.settlements || 0) > 0,
      count: componentCounts?.settlements,
    },
    {
      id: "communications",
      label: "Email History",
      icon: <Mail className="h-4 w-4" />,
      description: "Carrier correspondence timeline",
      available: (componentCounts?.emails || 0) > 0,
      count: componentCounts?.emails,
    },
    {
      id: "inspections",
      label: "Inspections",
      icon: <Calendar className="h-4 w-4" />,
      description: "Inspection history and notes",
      available: (componentCounts?.inspections || 0) > 0,
      count: componentCounts?.inspections,
    },
  ];

  const toggleComponent = (id: string) => {
    setSelectedComponents((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleAnalysis = (id: string) => {
    setSelectedAnalyses((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const selectAllAnalyses = () => {
    if (darwinAnalyses) {
      setSelectedAnalyses(darwinAnalyses.map(a => a.id));
    }
  };

  const deselectAllAnalyses = () => {
    setSelectedAnalyses([]);
  };

  const handleBuildPackage = async () => {
    if (selectedComponents.length === 0 && selectedAnalyses.length === 0) {
      toast({
        title: "Select components",
        description: "Please select at least one component or analysis to include",
        variant: "destructive",
      });
      return;
    }

    setIsBuilding(true);
    setProgress(0);
    setPackageUrl(null);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      // Get selected analysis content
      const selectedAnalysisContent = darwinAnalyses
        ?.filter(a => selectedAnalyses.includes(a.id))
        .map(a => ({
          type: ANALYSIS_TYPE_LABELS[a.analysis_type]?.label || a.analysis_type,
          date: a.created_at,
          content: a.result,
          summary: a.input_summary,
        })) || [];

      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId,
          analysisType: "one_click_package",
          additionalContext: {
            components: selectedComponents,
            includePhotos: selectedComponents.includes("photos"),
            includeDocuments: selectedComponents.includes("documents"),
            includeSettlement: selectedComponents.includes("settlement"),
            includeCommunications: selectedComponents.includes("communications"),
            includeInspections: selectedComponents.includes("inspections"),
            darwinAnalyses: selectedAnalysisContent,
          },
          claim,
        },
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) throw error;

      if (data?.packageUrl) {
        setPackageUrl(data.packageUrl);
        toast({
          title: "Package ready",
          description: "Your claim package has been compiled",
        });
      } else if (data?.result) {
        // Store result as a downloadable file
        const blob = new Blob([data.result], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        setPackageUrl(url);
        toast({
          title: "Package ready",
          description: "Your claim summary package has been generated",
        });
      }
    } catch (error: any) {
      console.error("Error building package:", error);
      toast({
        title: "Build failed",
        description: error.message || "Failed to build claim package",
        variant: "destructive",
      });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleDownload = () => {
    if (packageUrl) {
      const a = document.createElement("a");
      a.href = packageUrl;
      a.download = `Claim_Package_${claim.claim_number || claimId}_${new Date().toISOString().split("T")[0]}.txt`;
      a.click();
    }
  };

  // Group analyses by type for display
  const groupedAnalyses = darwinAnalyses?.reduce((acc, analysis) => {
    const type = analysis.analysis_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(analysis);
    return acc;
  }, {} as Record<string, DarwinAnalysis[]>) || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          One-Click Claim Package
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Automatically compile all claim materials into a single comprehensive package
        </p>

        {/* Standard Components */}
        <div>
          <h4 className="text-sm font-medium mb-2">Claim Data</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {components.map((component) => (
              <div
                key={component.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  component.available ? "bg-background" : "bg-muted/50 opacity-60"
                }`}
              >
                <Checkbox
                  id={component.id}
                  checked={selectedComponents.includes(component.id)}
                  onCheckedChange={() => toggleComponent(component.id)}
                  disabled={!component.available || isBuilding}
                />
                <div className="flex-1">
                  <Label
                    htmlFor={component.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {component.icon}
                    <span>{component.label}</span>
                    {component.count !== undefined && (
                      <span className="text-xs text-muted-foreground">({component.count})</span>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">{component.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Darwin Analyses Section */}
        {darwinAnalyses && darwinAnalyses.length > 0 && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Darwin Analyses & Rebuttals ({darwinAnalyses.length})
              </h4>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllAnalyses}
                  disabled={isBuilding}
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deselectAllAnalyses}
                  disabled={isBuilding}
                >
                  Clear
                </Button>
              </div>
            </div>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-3">
                {Object.entries(groupedAnalyses).map(([type, analyses]) => (
                  <div key={type} className="space-y-2">
                    <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      {ANALYSIS_TYPE_LABELS[type]?.icon}
                      {ANALYSIS_TYPE_LABELS[type]?.label || type.replace(/_/g, ' ')}
                    </h5>
                    {analyses.map((analysis) => (
                      <div
                        key={analysis.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-background"
                      >
                        <Checkbox
                          id={analysis.id}
                          checked={selectedAnalyses.includes(analysis.id)}
                          onCheckedChange={() => toggleAnalysis(analysis.id)}
                          disabled={isBuilding}
                        />
                        <div className="flex-1 min-w-0">
                          <Label
                            htmlFor={analysis.id}
                            className="cursor-pointer text-sm"
                          >
                            {analysis.input_summary 
                              ? analysis.input_summary.substring(0, 60) + (analysis.input_summary.length > 60 ? "..." : "")
                              : `Analysis from ${format(new Date(analysis.created_at), "MMM d, yyyy")}`
                            }
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(analysis.created_at), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* No analyses message */}
        {(!darwinAnalyses || darwinAnalyses.length === 0) && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
              <Brain className="h-4 w-4" />
              <span>No Darwin analyses available yet. Generate rebuttals or analyses from the Darwin tools to include them here.</span>
            </div>
          </div>
        )}

        {isBuilding && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              Building package... {progress}%
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleBuildPackage}
            disabled={isBuilding || (selectedComponents.length === 0 && selectedAnalyses.length === 0)}
            className="flex-1"
          >
            {isBuilding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Building Package...
              </>
            ) : (
              <>
                <Package className="h-4 w-4 mr-2" />
                Build Package {selectedAnalyses.length > 0 && `(+${selectedAnalyses.length} analyses)`}
              </>
            )}
          </Button>

          {packageUrl && (
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};