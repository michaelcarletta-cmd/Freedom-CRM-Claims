import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Building2, FileText, Loader2 } from "lucide-react";

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming"
];

export function CompanyBrandingSettings() {
  const [companyName, setCompanyName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  const [email, setEmail] = useState("");
  const [letterheadUrl, setLetterheadUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    // Load from localStorage for now (can be moved to DB later)
    const saved = localStorage.getItem("company_branding");
    if (saved) {
      const data = JSON.parse(saved);
      setCompanyName(data.companyName || "");
      setLicenseNumber(data.licenseNumber || "");
      setLicenseState(data.licenseState || "");
      setAddress(data.address || "");
      setPhone(data.phone || "");
      setFax(data.fax || "");
      setEmail(data.email || "");
      setLetterheadUrl(data.letterheadUrl || null);
    }
  };

  const handleLetterheadUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file (PNG, JPG)", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const path = `letterhead/company_letterhead_${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("document-templates").upload(path, file);
      
      if (error) throw error;

      const { data: urlData } = await supabase.storage.from("document-templates").createSignedUrl(path, 31536000); // 1 year
      
      setLetterheadUrl(urlData?.signedUrl || null);
      toast({ title: "Letterhead uploaded successfully" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const saveSettings = () => {
    setSaving(true);
    const data = {
      companyName,
      licenseNumber,
      licenseState,
      address,
      phone,
      fax,
      email,
      letterheadUrl
    };
    localStorage.setItem("company_branding", JSON.stringify(data));
    setTimeout(() => {
      setSaving(false);
      toast({ title: "Company branding saved" });
    }, 500);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Information
          </CardTitle>
          <CardDescription>
            This information will appear on generated reports and demand letters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Freedom Claims Adjusting"
              />
            </div>
            <div>
              <Label>License Number</Label>
              <Input
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="PA-12345"
              />
            </div>
          </div>

          <div>
            <Label>Licensed State</Label>
            <Select value={licenseState} onValueChange={setLicenseState}>
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Address</Label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main Street&#10;Suite 100&#10;Philadelphia, PA 19103"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <Label>Fax</Label>
              <Input
                value={fax}
                onChange={(e) => setFax(e.target.value)}
                placeholder="(555) 123-4568"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="claims@freedomclaims.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Letterhead
          </CardTitle>
          <CardDescription>
            Upload your company letterhead image to use in generated reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {letterheadUrl && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground mb-2">Current Letterhead:</p>
                <img src={letterheadUrl} alt="Company letterhead" className="max-h-32 object-contain" />
              </div>
            )}
            
            <div>
              <Label htmlFor="letterhead-upload" className="cursor-pointer">
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
                  {uploading ? (
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {uploading ? "Uploading..." : "Click to upload letterhead image (PNG, JPG)"}
                  </p>
                </div>
              </Label>
              <Input
                id="letterhead-upload"
                type="file"
                accept="image/*"
                onChange={handleLetterheadUpload}
                className="hidden"
                disabled={uploading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving}>
        {saving ? "Saving..." : "Save Company Branding"}
      </Button>
    </div>
  );
}
