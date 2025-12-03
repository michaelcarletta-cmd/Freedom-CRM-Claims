import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Grid, Columns, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ClaimPhoto {
  id: string;
  claim_id: string;
  file_path: string;
  file_name: string;
  category: string;
  description: string | null;
  annotated_file_path: string | null;
  before_after_type: string | null;
  before_after_pair_id: string | null;
}

interface PhotoReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: ClaimPhoto[];
  claim: any;
  claimId: string;
}

const AI_REPORT_TYPES = [
  { 
    id: "full-report", 
    name: "Full Photo Report", 
    description: "Comprehensive analysis of all photos with damage assessment and recommendations" 
  },
  { 
    id: "damage-assessment", 
    name: "Damage Assessment", 
    description: "Focused analysis of visible damage with severity ratings" 
  },
  { 
    id: "before-after", 
    name: "Before/After Analysis", 
    description: "Compare before and after photos to document repairs" 
  },
  { 
    id: "quick-analysis", 
    name: "Quick Summary", 
    description: "Brief overview of damage for quick reference" 
  },
];

export function PhotoReportDialog({ open, onOpenChange, photos, claim, claimId }: PhotoReportDialogProps) {
  const [reportTitle, setReportTitle] = useState("");
  const [reportType, setReportType] = useState<"grid" | "before-after" | "detailed">("grid");
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [includeDescriptions, setIncludeDescriptions] = useState(true);
  const [includeCategories, setIncludeCategories] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"standard" | "ai">("ai");
  const [aiReportType, setAiReportType] = useState("full-report");
  const [aiReport, setAiReport] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setReportTitle(`Photo Report - ${claim?.policyholder_name || "Claim"} - ${new Date().toLocaleDateString()}`);
      setSelectedPhotos(photos.map(p => p.id));
      setAiReport(null);
    }
  }, [open, claim, photos]);

  const togglePhoto = (photoId: string) => {
    setSelectedPhotos(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  const selectAll = () => setSelectedPhotos(photos.map(p => p.id));
  const selectNone = () => setSelectedPhotos([]);

  const generateAIReport = async () => {
    if (selectedPhotos.length === 0) {
      toast({ title: "Please select at least one photo", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setAiReport(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("analyze-photos", {
        body: {
          photoIds: selectedPhotos,
          claimId,
          reportType: aiReportType,
        },
      });

      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.error);
      }

      setAiReport(data.report);
      toast({ title: "AI analysis complete" });
    } catch (error: any) {
      console.error("AI report error:", error);
      toast({ 
        title: "Error generating AI report", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    } finally {
      setGenerating(false);
    }
  };

  const saveAIReport = async () => {
    if (!aiReport) return;
    
    try {
      // Create HTML report with AI content
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${reportTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
    h2 { color: #2563eb; margin-top: 30px; }
    h3 { color: #4b5563; }
    .header { margin-bottom: 30px; }
    .claim-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .ai-badge { background: #8b5cf6; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${reportTitle}</h1>
    <span class="ai-badge">AI Generated</span>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
  <div class="claim-info">
    <p><strong>Claim Number:</strong> ${claim?.claim_number || 'N/A'}</p>
    <p><strong>Policyholder:</strong> ${claim?.policyholder_name || 'N/A'}</p>
    <p><strong>Property:</strong> ${claim?.policyholder_address || 'N/A'}</p>
    <p><strong>Loss Type:</strong> ${claim?.loss_type || 'N/A'}</p>
  </div>
  <div class="content">
    ${aiReport.replace(/\n/g, '<br>').replace(/##\s(.*)/g, '<h2>$1</h2>').replace(/###\s(.*)/g, '<h3>$1</h3>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
  </div>
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html" });
      const reportPath = `${claimId}/reports/ai_photo_report_${Date.now()}.html`;
      
      await supabase.storage.from("claim-files").upload(reportPath, blob);
      
      await supabase.from("claim_files").insert({
        claim_id: claimId,
        file_name: `AI Photo Report - ${new Date().toLocaleDateString()}.html`,
        file_path: reportPath,
        file_type: "text/html",
        file_size: blob.size,
      });

      // Download the report
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportTitle.replace(/[^a-z0-9]/gi, "_")}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Report saved to claim files and downloaded" });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error saving report", variant: "destructive" });
    }
  };

  const generateStandardReport = async () => {
    if (selectedPhotos.length === 0) {
      toast({ title: "Please select at least one photo", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const selectedPhotoData = photos.filter(p => selectedPhotos.includes(p.id));
      
      const photoUrls = await Promise.all(
        selectedPhotoData.map(async (photo) => {
          const path = photo.annotated_file_path || photo.file_path;
          const { data } = await supabase.storage
            .from("claim-files")
            .createSignedUrl(path, 3600);
          return { ...photo, signedUrl: data?.signedUrl || "" };
        })
      );

      const html = generateReportHtml(photoUrls, reportTitle, reportType, includeDescriptions, includeCategories, claim);
      
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportTitle.replace(/[^a-z0-9]/gi, "_")}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const reportPath = `${claimId}/reports/photo_report_${Date.now()}.html`;
      await supabase.storage.from("claim-files").upload(reportPath, blob);
      
      await supabase.from("claim_files").insert({
        claim_id: claimId,
        file_name: `${reportTitle}.html`,
        file_path: reportPath,
        file_type: "text/html",
        file_size: blob.size,
      });

      toast({ title: "Report generated and saved to claim files" });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Report generation error:", error);
      toast({ title: "Error generating report", description: error.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Generate Photo Report</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Analysis
            </TabsTrigger>
            <TabsTrigger value="standard">
              <FileText className="h-4 w-4 mr-2" />
              Standard Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <div>
              <Label>Report Title</Label>
              <Input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="mb-2 block">AI Report Type</Label>
              <div className="grid grid-cols-2 gap-3">
                {AI_REPORT_TYPES.map(type => (
                  <Card 
                    key={type.id}
                    className={`cursor-pointer transition-all ${aiReportType === type.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setAiReportType(type.id)}
                  >
                    <CardHeader className="p-3">
                      <CardTitle className="text-sm">{type.name}</CardTitle>
                      <CardDescription className="text-xs">{type.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>

            <PhotoSelector 
              photos={photos} 
              selectedPhotos={selectedPhotos} 
              togglePhoto={togglePhoto}
              selectAll={selectAll}
              selectNone={selectNone}
            />

            {aiReport && (
              <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-auto">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Analysis Result
                </h4>
                <div className="text-sm whitespace-pre-wrap">{aiReport}</div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              {aiReport ? (
                <Button onClick={saveAIReport}>
                  <Download className="h-4 w-4 mr-2" />
                  Save & Download Report
                </Button>
              ) : (
                <Button onClick={generateAIReport} disabled={generating || selectedPhotos.length === 0}>
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing Photos...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate AI Report
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </TabsContent>

          <TabsContent value="standard" className="space-y-4 mt-4">
            <div>
              <Label>Report Title</Label>
              <Input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Report Layout</Label>
              <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">
                    <div className="flex items-center gap-2">
                      <Grid className="h-4 w-4" />
                      Photo Grid (3 per row)
                    </div>
                  </SelectItem>
                  <SelectItem value="before-after">
                    <div className="flex items-center gap-2">
                      <Columns className="h-4 w-4" />
                      Before/After Comparison
                    </div>
                  </SelectItem>
                  <SelectItem value="detailed">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Detailed (1 per page)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeDescriptions}
                  onCheckedChange={(c) => setIncludeDescriptions(!!c)}
                />
                Include Descriptions
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeCategories}
                  onCheckedChange={(c) => setIncludeCategories(!!c)}
                />
                Include Categories
              </label>
            </div>

            <PhotoSelector 
              photos={photos} 
              selectedPhotos={selectedPhotos} 
              togglePhoto={togglePhoto}
              selectAll={selectAll}
              selectNone={selectNone}
            />

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={generateStandardReport} disabled={generating || selectedPhotos.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                {generating ? "Generating..." : "Generate Report"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PhotoSelector({ 
  photos, 
  selectedPhotos, 
  togglePhoto,
  selectAll,
  selectNone 
}: { 
  photos: ClaimPhoto[]; 
  selectedPhotos: string[];
  togglePhoto: (id: string) => void;
  selectAll: () => void;
  selectNone: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <Label>Select Photos ({selectedPhotos.length} of {photos.length})</Label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
          <Button variant="outline" size="sm" onClick={selectNone}>Clear</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-auto p-2 border rounded">
        {photos.map(photo => (
          <PhotoThumbnail
            key={photo.id}
            photo={photo}
            selected={selectedPhotos.includes(photo.id)}
            onToggle={() => togglePhoto(photo.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PhotoThumbnail({ 
  photo, 
  selected, 
  onToggle 
}: { 
  photo: ClaimPhoto; 
  selected: boolean; 
  onToggle: () => void;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const loadUrl = async () => {
      const { data } = await supabase.storage
        .from("claim-files")
        .createSignedUrl(photo.annotated_file_path || photo.file_path, 3600);
      if (data?.signedUrl) setUrl(data.signedUrl);
    };
    loadUrl();
  }, [photo]);

  return (
    <div
      className={`relative aspect-square cursor-pointer rounded overflow-hidden border-2 ${
        selected ? "border-primary" : "border-transparent"
      }`}
      onClick={onToggle}
    >
      {url ? (
        <img src={url} alt={photo.file_name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-muted" />
      )}
      {selected && (
        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function generateReportHtml(
  photos: Array<ClaimPhoto & { signedUrl: string }>,
  title: string,
  type: "grid" | "before-after" | "detailed",
  includeDescriptions: boolean,
  includeCategories: boolean,
  claim: any
): string {
  const styles = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; padding: 20px; background: #fff; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
      .header h1 { font-size: 24px; margin-bottom: 10px; }
      .header p { color: #666; }
      .claim-info { margin-bottom: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
      .claim-info p { margin: 5px 0; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
      .photo-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
      .photo-card img { width: 100%; height: 200px; object-fit: cover; }
      .photo-card .info { padding: 10px; }
      .photo-card .category { font-size: 12px; color: #666; font-weight: bold; }
      .photo-card .description { font-size: 14px; margin-top: 5px; }
      .before-after { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; page-break-inside: avoid; }
      .before-after h3 { text-align: center; margin-bottom: 10px; }
      .before-after img { width: 100%; border-radius: 8px; }
      .detailed-photo { page-break-after: always; margin-bottom: 30px; }
      .detailed-photo img { max-width: 100%; max-height: 500px; display: block; margin: 0 auto; border-radius: 8px; }
      .detailed-photo .info { margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
      @media print { 
        body { padding: 0; }
        .grid { grid-template-columns: repeat(2, 1fr); }
      }
    </style>
  `;

  let content = "";

  if (type === "grid") {
    content = `<div class="grid">${photos.map(photo => `
      <div class="photo-card">
        <img src="${photo.signedUrl}" alt="${photo.file_name}" />
        <div class="info">
          ${includeCategories ? `<p class="category">${photo.category}</p>` : ""}
          ${includeDescriptions && photo.description ? `<p class="description">${photo.description}</p>` : ""}
        </div>
      </div>
    `).join("")}</div>`;
  } else if (type === "before-after") {
    const pairs = photos
      .filter(p => p.before_after_type === "before" && p.before_after_pair_id)
      .map(before => ({
        before,
        after: photos.find(p => p.before_after_pair_id === before.before_after_pair_id && p.before_after_type === "after"),
      }))
      .filter(pair => pair.after);

    content = pairs.map((pair) => `
      <div class="before-after">
        <div>
          <h3>Before</h3>
          <img src="${pair.before.signedUrl}" alt="Before" />
          ${includeDescriptions && pair.before.description ? `<p style="margin-top:10px">${pair.before.description}</p>` : ""}
        </div>
        <div>
          <h3>After</h3>
          <img src="${pair.after!.signedUrl}" alt="After" />
          ${includeDescriptions && pair.after!.description ? `<p style="margin-top:10px">${pair.after!.description}</p>` : ""}
        </div>
      </div>
    `).join("");

    if (pairs.length === 0) {
      content = `<p>No before/after pairs available.</p>`;
    }
  } else {
    content = photos.map(photo => `
      <div class="detailed-photo">
        <img src="${photo.signedUrl}" alt="${photo.file_name}" />
        <div class="info">
          ${includeCategories ? `<p><strong>Category:</strong> ${photo.category}</p>` : ""}
          ${includeDescriptions && photo.description ? `<p><strong>Description:</strong> ${photo.description}</p>` : ""}
          <p><strong>File:</strong> ${photo.file_name}</p>
        </div>
      </div>
    `).join("");
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      ${styles}
    </head>
    <body>
      <div class="header">
        <h1>${title}</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>
      <div class="claim-info">
        <p><strong>Policyholder:</strong> ${claim?.policyholder_name || "N/A"}</p>
        <p><strong>Address:</strong> ${claim?.policyholder_address || "N/A"}</p>
        <p><strong>Claim Number:</strong> ${claim?.claim_number || "N/A"}</p>
        <p><strong>Insurance:</strong> ${claim?.insurance_company || "N/A"}</p>
      </div>
      ${content}
    </body>
    </html>
  `;
}
