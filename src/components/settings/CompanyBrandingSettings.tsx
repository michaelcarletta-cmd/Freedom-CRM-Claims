import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Building2, FileText, Loader2 } from "lucide-react";

export function CompanyBrandingSettings() {
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [letterheadUrl, setLetterheadUrl] = useState<string | null>(null);
  const [signnowWebhookUrl, setSignnowWebhookUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brandingId, setBrandingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from("company_branding" as any)
      .select("*")
      .limit(1)
      .maybeSingle();
    
    if (data) {
      const branding = data as any;
      setBrandingId(branding.id);
      setCompanyName(branding.company_name || "");
      setAddress(branding.company_address || "");
      setPhone(branding.company_phone || "");
      setEmail(branding.company_email || "");
      setLetterheadUrl(branding.letterhead_url || null);
      setSignnowWebhookUrl(branding.signnow_make_webhook_url || "");
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
      const path = `letterhead_${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("company-branding").upload(path, file);
      
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("company-branding").getPublicUrl(path);
      
      setLetterheadUrl(urlData?.publicUrl || null);
      toast({ title: "Letterhead uploaded successfully" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const brandingData = {
        company_name: companyName,
        company_address: address,
        company_phone: phone,
        company_email: email,
        letterhead_url: letterheadUrl,
        signnow_make_webhook_url: signnowWebhookUrl || null,
        updated_at: new Date().toISOString()
      };

      if (brandingId) {
        await supabase
          .from("company_branding" as any)
          .update(brandingData)
          .eq("id", brandingId);
      } else {
        const { data } = await supabase
          .from("company_branding" as any)
          .insert(brandingData)
          .select()
          .single();
        if (data) setBrandingId((data as any).id);
      }

      toast({ title: "Company branding saved" });
    } catch (error: any) {
      toast({ title: "Error saving branding", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
          <div>
            <Label>Company Name</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Freedom Claims Adjusting"
            />
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            SignNow Integration (via Make.com)
          </CardTitle>
          <CardDescription>
            Configure your Make.com webhook URL to send documents to SignNow for electronic signatures
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Make.com Webhook URL</Label>
            <Input
              value={signnowWebhookUrl}
              onChange={(e) => setSignnowWebhookUrl(e.target.value)}
              placeholder="https://hook.us1.make.com/..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Create a Make.com scenario with a webhook trigger, connect it to SignNow, and paste the webhook URL here.
              When you send documents for signature, they will be sent to this webhook.
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">Callback URL for signed documents:</p>
            <code className="block bg-background p-2 rounded text-xs break-all">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/signature-webhook
            </code>
            <p className="text-muted-foreground text-xs">
              Configure SignNow/Make to POST to this URL when documents are signed.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving}>
        {saving ? "Saving..." : "Save Company Branding"}
      </Button>
    </div>
  );
}
