import { useState, useEffect, useRef } from "react";
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
import html2pdf from "html2pdf.js";

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
    id: "demand-package", 
    name: "Complete Demand Package", 
    description: "Full package with letterhead, table of contents, demand letter, valuation, and photo documentation" 
  },
  { 
    id: "full-report", 
    name: "Forensic Photo Report", 
    description: "Comprehensive forensic analysis with damage assessment and restoration requirements" 
  },
  { 
    id: "damage-assessment", 
    name: "Damage Assessment", 
    description: "Focused analysis of visible damage with severity ratings and repair scope" 
  },
  { 
    id: "proof-of-loss", 
    name: "Proof of Loss Valuation", 
    description: "Detailed scope of work with forensic documentation supporting claim value" 
  },
  { 
    id: "final-demand", 
    name: "Final Demand Letter", 
    description: "Professional demand letter with state insurance code references and liability sections" 
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
  const [aiReportType, setAiReportType] = useState("demand-package");
  const [companyBranding, setCompanyBranding] = useState<{ company_name?: string; letterhead_url?: string } | null>(null);

  useEffect(() => {
    const fetchBranding = async () => {
      const { data } = await supabase
        .from("company_branding" as any)
        .select("company_name, letterhead_url")
        .limit(1)
        .maybeSingle();
      if (data) setCompanyBranding(data as any);
    };
    fetchBranding();
  }, []);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiPhotoUrls, setAiPhotoUrls] = useState<{ url: string; fileName: string; category: string; description: string; photoNumber: number }[]>([]);
  const [weatherData, setWeatherData] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setReportTitle(`Photo Report - ${claim?.policyholder_name || "Claim"} - ${new Date().toLocaleDateString()}`);
      setSelectedPhotos(photos.map(p => p.id));
      setAiReport(null);
      setAiPhotoUrls([]);
      setWeatherData(null);
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
      setAiPhotoUrls(data.photoUrls || []);
      setWeatherData(data.weatherData || null);
      toast({ title: "Analysis complete" });
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
      // Convert photo URLs to base64 for PDF embedding
      const photoBase64s: { base64: string; photoNumber: number; category: string; description: string }[] = [];
      
      for (const photo of aiPhotoUrls) {
        try {
          const response = await fetch(photo.url);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          photoBase64s.push({
            base64,
            photoNumber: photo.photoNumber,
            category: photo.category,
            description: photo.description
          });
        } catch (e) {
          console.error("Failed to convert photo to base64:", e);
        }
      }

      // Build photos HTML with base64 images and photo numbers
      const photosHtml = photoBase64s.length > 0 ? `
  <div style="margin-top: 40px; page-break-before: always;">
    <h2 style="color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; font-size: 24px;">EXHIBIT A: PHOTO DOCUMENTATION</h2>
    <div style="margin-top: 20px;">
      ${photoBase64s.map(photo => `
        <div style="page-break-inside: avoid; margin-bottom: 30px;">
          <p style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #1f2937;">Photo ${photo.photoNumber}: ${photo.category}</p>
          <img src="${photo.base64}" style="width: 100%; max-width: 600px; height: auto; border-radius: 8px; border: 1px solid #ddd;" />
          ${photo.description ? `<p style="margin-top: 8px; font-size: 12px; color: #666; font-style: italic;">${photo.description}</p>` : ''}
        </div>
      `).join('')}
    </div>
  </div>` : '';

      // Letterhead HTML
      const letterheadHtml = companyBranding?.letterhead_url ? `
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${companyBranding.letterhead_url}" style="max-width: 100%; max-height: 150px; object-fit: contain;" />
        </div>
      ` : companyBranding?.company_name ? `
        <div style="text-align: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 3px solid #1e3a5f;">
          <h1 style="font-size: 28px; color: #1e3a5f; margin: 0;">${companyBranding.company_name}</h1>
        </div>
      ` : '';

      // Check if this is a demand package - needs special formatting
      const isDemandPackage = aiReportType === 'demand-package';
      
      // Weather Report Exhibit HTML
      const weatherExhibitHtml = (isDemandPackage && weatherData && weatherData.daily) ? `
  <div style="margin-top: 40px; page-break-before: always;">
    <h2 style="color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; font-size: 24px;">EXHIBIT B: WEATHER REPORT</h2>
    <p style="margin-top: 20px; font-size: 14px; color: #666;">Historical weather data retrieved from Open-Meteo Archive API</p>
    
    <div style="margin-top: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <h3 style="color: #1e3a5f; margin-bottom: 15px;">Location Information</h3>
      <p><strong>Property Address:</strong> ${weatherData.location || claim?.policyholder_address || 'N/A'}</p>
      <p><strong>Coordinates:</strong> ${weatherData.latitude?.toFixed(4)}, ${weatherData.longitude?.toFixed(4)}</p>
      <p><strong>Loss Date:</strong> ${weatherData.lossDate || claim?.loss_date || 'N/A'}</p>
    </div>

    <div style="margin-top: 30px;">
      <h3 style="color: #1e3a5f; margin-bottom: 15px;">Weather Conditions Summary</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #1e3a5f; color: white;">
            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Date</th>
            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Conditions</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">High / Low</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Precipitation</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Max Wind Speed</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Max Wind Gusts</th>
          </tr>
        </thead>
        <tbody>
          ${weatherData.daily.dates?.map((date: string, i: number) => `
            <tr style="background: ${i === weatherData.dayIndex ? '#fef3c7' : (i % 2 === 0 ? '#ffffff' : '#f8fafc')}; ${i === weatherData.dayIndex ? 'font-weight: bold;' : ''}">
              <td style="padding: 12px; border: 1px solid #ddd;">
                ${date}
                ${i === weatherData.dayIndex ? '<br><span style="color: #d97706; font-size: 12px;">(Loss Date)</span>' : ''}
              </td>
              <td style="padding: 12px; border: 1px solid #ddd;">${weatherData.daily.weatherDescription?.[i] || 'N/A'}</td>
              <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">${weatherData.daily.maxTemp?.[i]}°F / ${weatherData.daily.minTemp?.[i]}°F</td>
              <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">${weatherData.daily.precipitation?.[i]} mm</td>
              <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">${weatherData.daily.maxWindSpeed?.[i]} mph</td>
              <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">${weatherData.daily.maxWindGusts?.[i]} mph</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-top: 30px; padding: 15px; background: #eff6ff; border-left: 4px solid #1e3a5f; border-radius: 4px;">
      <h4 style="color: #1e3a5f; margin-bottom: 10px;">Data Source</h4>
      <p style="font-size: 13px; color: #374151;">
        Weather data sourced from Open-Meteo Historical Weather API. Data includes temperature, precipitation, 
        wind speed, and wind gusts recorded at the property location for the loss date and surrounding days.
        This historical weather documentation supports the cause of loss analysis.
      </p>
    </div>
  </div>
      ` : '';
      
      // Table of Contents for demand package
      const tocHtml = isDemandPackage ? `
        <div style="page-break-after: always;">
          <h2 style="color: #1e3a5f; font-size: 24px; text-align: center; margin-bottom: 30px;">TABLE OF CONTENTS</h2>
          <div style="font-size: 14px; line-height: 2;">
            <p><strong>I.</strong> Cover Letter / Final Demand ........................... 3</p>
            <p><strong>II.</strong> Factual Background ........................... 4</p>
            <p><strong>III.</strong> Damage Analysis ........................... 5</p>
            <p><strong>IV.</strong> Proof of Loss / Valuation ........................... 6</p>
            <p><strong>V.</strong> Restoration Requirements ........................... 8</p>
            <p><strong>VI.</strong> Prospective Liability ........................... 10</p>
            <p><strong>VII.</strong> Demand for Payment ........................... 11</p>
            <p><strong>EXHIBIT A:</strong> Photo Documentation ........................... 12</p>
            ${weatherData ? '<p><strong>EXHIBIT B:</strong> Weather Report ........................... 13</p>' : ''}
          </div>
        </div>
      ` : '';

      // Format report content with proper styling
      const formattedReport = aiReport
        .replace(/\n/g, '<br>')
        .replace(/##\s(.*)/g, '<h2 style="color: #1e3a5f; margin-top: 30px; font-size: 20px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">$1</h2>')
        .replace(/###\s(.*)/g, '<h3 style="color: #374151; margin-top: 20px; font-size: 16px;">$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Create HTML content for PDF
      const html = `
<div style="font-family: 'Times New Roman', Times, serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.8; color: #1f2937;">
  ${letterheadHtml}
  
  ${isDemandPackage ? `
    <div style="text-align: center; margin: 60px 0; page-break-after: always;">
      <h1 style="font-size: 32px; color: #1e3a5f; margin-bottom: 20px;">NOTICE OF FINAL DEMAND</h1>
      <h2 style="font-size: 18px; color: #4b5563; font-weight: normal;">AND</h2>
      <h2 style="font-size: 24px; color: #1e3a5f; margin-top: 20px;">COMPLETE DEMAND PACKAGE</h2>
      <div style="margin-top: 60px; text-align: left; padding: 20px; background: #f8fafc; border-radius: 8px;">
        <p><strong>RE:</strong> ${claim?.policyholder_name || 'Policyholder'}</p>
        <p><strong>Property:</strong> ${claim?.policyholder_address || 'Property Address'}</p>
        <p><strong>Claim No.:</strong> ${claim?.claim_number || 'N/A'}</p>
        <p><strong>Policy No.:</strong> ${claim?.policy_number || 'N/A'}</p>
        <p><strong>Date of Loss:</strong> ${claim?.loss_date || 'N/A'}</p>
        <p><strong>Insurance Company:</strong> ${claim?.insurance_company || 'N/A'}</p>
      </div>
      <p style="margin-top: 40px; font-size: 14px; color: #6b7280;">Prepared: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    </div>
    ${tocHtml}
  ` : `
    <div style="margin-bottom: 30px;">
      <h1 style="border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; color: #1e3a5f;">${reportTitle}</h1>
      <p style="color: #666;">Generated on ${new Date().toLocaleString()}</p>
    </div>
    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p><strong>Claim Number:</strong> ${claim?.claim_number || 'N/A'}</p>
      <p><strong>Policyholder:</strong> ${claim?.policyholder_name || 'N/A'}</p>
      <p><strong>Property:</strong> ${claim?.policyholder_address || 'N/A'}</p>
      <p><strong>Loss Type:</strong> ${claim?.loss_type || 'N/A'}</p>
    </div>
  `}
  
  <div style="text-align: justify;">
    ${formattedReport}
  </div>
  ${photosHtml}
  ${weatherExhibitHtml}
</div>`;

      // Generate PDF
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      
      const pdfBlob = await html2pdf().from(container).set({
        margin: 10,
        filename: `${reportTitle.replace(/[^a-z0-9]/gi, "_")}.pdf`,
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      }).outputPdf("blob");
      
      document.body.removeChild(container);
      
      const reportPath = `${claimId}/reports/ai_photo_report_${Date.now()}.pdf`;
      
      await supabase.storage.from("claim-files").upload(reportPath, pdfBlob);
      
      await supabase.from("claim_files").insert({
        claim_id: claimId,
        file_name: `AI Photo Report - ${new Date().toLocaleDateString()}.pdf`,
        file_path: reportPath,
        file_type: "application/pdf",
        file_size: pdfBlob.size,
      });

      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportTitle.replace(/[^a-z0-9]/gi, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Report saved to claim files and downloaded" });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving report:", error);
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
      <div className="grid grid-cols-6 md:grid-cols-10 gap-1 max-h-40 overflow-auto p-2 border rounded">
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
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Lazy load: only fetch URL when thumbnail becomes visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "50px" }
    );
    
    if (ref.current) {
      observer.observe(ref.current);
    }
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    const loadUrl = async () => {
      const { data } = await supabase.storage
        .from("claim-files")
        .createSignedUrl(photo.annotated_file_path || photo.file_path, 3600);
      if (data?.signedUrl) setUrl(data.signedUrl);
    };
    loadUrl();
  }, [isVisible, photo]);

  return (
    <div
      ref={ref}
      className={`relative aspect-square cursor-pointer rounded overflow-hidden border-2 ${
        selected ? "border-primary" : "border-transparent"
      }`}
      onClick={onToggle}
    >
      {url ? (
        <img src={url} alt={photo.file_name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-muted animate-pulse" />
      )}
      {selected && (
        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
            <svg className="w-2 h-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
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
