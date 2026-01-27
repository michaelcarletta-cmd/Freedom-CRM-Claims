import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Package, Loader2, Download, FileText, Image, Receipt, FileCheck, Mail, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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

export const DarwinOneClickPackage = ({ claimId, claim }: DarwinOneClickPackageProps) => {
  const { toast } = useToast();
  const [selectedComponents, setSelectedComponents] = useState<string[]>([
    "claim_summary",
    "photos",
    "documents",
    "settlement",
    "communications",
  ]);
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

  const handleBuildPackage = async () => {
    if (selectedComponents.length === 0) {
      toast({
        title: "Select components",
        description: "Please select at least one component to include",
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
            disabled={isBuilding || selectedComponents.length === 0}
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
                Build Package
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
