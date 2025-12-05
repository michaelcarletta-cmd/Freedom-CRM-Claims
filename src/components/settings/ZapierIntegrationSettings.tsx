import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, CheckCircle, Camera, Zap, ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zapier-webhook`;

export function ZapierIntegrationSettings() {
  const { toast } = useToast();
  const [testingImport, setTestingImport] = useState(false);
  const [testPolicyNumber, setTestPolicyNumber] = useState("");

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast({
      title: "Copied!",
      description: "Webhook URL copied to clipboard",
    });
  };

  const testImportWebhook = async () => {
    if (!testPolicyNumber.trim()) {
      toast({
        title: "Error",
        description: "Enter a policy number to test",
        variant: "destructive",
      });
      return;
    }

    setTestingImport(true);
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_photo",
          data: {
            policy_number: testPolicyNumber.trim(),
            photo_url: "https://via.placeholder.com/400x300.png?text=Test+Photo",
            photo_name: `test_photo_${Date.now()}.png`,
            category: "Company Cam Test",
            description: "Test photo from Zapier integration settings",
          },
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        toast({
          title: "Test Successful!",
          description: "Test photo imported to the claim. Check the Photos tab.",
        });
      } else {
        toast({
          title: "Test Failed",
          description: result.error || "Could not import test photo",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect to webhook",
        variant: "destructive",
      });
    } finally {
      setTestingImport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Company Cam Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Company Cam Integration
                <Badge variant="secondary">via Zapier</Badge>
              </CardTitle>
              <CardDescription>
                Automatically sync photos between Company Cam and Freedom Claims
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Webhook URL */}
          <div className="space-y-2">
            <Label className="text-base font-medium">Your Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                value={WEBHOOK_URL}
                readOnly
                className="font-mono text-sm bg-muted"
              />
              <Button variant="outline" onClick={copyWebhookUrl}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Use this URL in your Zapier webhook action
            </p>
          </div>

          {/* Test Connection */}
          <div className="space-y-2">
            <Label className="text-base font-medium">Test Import</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter policy number (e.g., H3V28875630740)"
                value={testPolicyNumber}
                onChange={(e) => setTestPolicyNumber(e.target.value)}
                className="font-mono"
              />
              <Button 
                onClick={testImportWebhook} 
                disabled={testingImport}
                variant="secondary"
              >
                {testingImport ? "Testing..." : "Test Import"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              This will import a test photo to the claim with the given policy number
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            Zapier Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Import Photos */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Import Photos FROM Company Cam
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-4">
              <li>Go to <a href="https://zapier.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Zapier.com</a> and create a new Zap</li>
              <li><strong>Trigger:</strong> Company Cam → "New Photo"</li>
              <li><strong>Action:</strong> Webhooks by Zapier → "POST"</li>
              <li>Set URL to your webhook URL above</li>
              <li>Set Payload Type to "JSON"</li>
              <li>Configure the data fields (see below)</li>
            </ol>
            
            {/* Critical Warning */}
            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg ml-4">
              <h5 className="font-medium text-destructive flex items-center gap-2 mb-2">
                ⚠️ CRITICAL: Use "URI" NOT "Public URL"
              </h5>
              <p className="text-sm text-muted-foreground">
                Company Cam has multiple URL fields. You <strong>MUST</strong> use the <strong>"URI"</strong> field 
                (the direct image URL) for <code className="bg-muted px-1 rounded">photo_url</code>. 
                Do NOT use "Public URL" - that's just a webpage link, not the actual image.
              </p>
            </div>
            
            <div className="bg-muted p-4 rounded-lg font-mono text-sm ml-4 overflow-x-auto">
              <pre>{`{
  "action": "import_photo",
  "data": {
    "policy_number": "{{Project Name}}",
    "photo_url": "{{URI}}",
    "photo_name": "{{Photo Filename}}",
    "category": "Company Cam",
    "description": "{{Photo Notes}}"
  }
}`}</pre>
            </div>
            <p className="text-xs text-muted-foreground ml-4">
              <strong>Field mapping:</strong> URI = direct image URL, Project Name = policy number for claim matching
            </p>
          </div>

          {/* Export Claims */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Export Claims TO Company Cam
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-4">
              <li>Create a Zap with trigger: "Webhooks by Zapier" → "Catch Hook"</li>
              <li><strong>Action:</strong> Company Cam → "Create Project"</li>
              <li>Use the claim data returned from the webhook</li>
              <li>From Freedom Claims, trigger export via the Automations system</li>
            </ol>
          </div>

          {/* Important Note */}
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
            <h4 className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Important: Project Naming
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Name your Company Cam projects using the <strong>policy number</strong> (e.g., "H3V28875630740") 
              so photos automatically route to the correct claim in Freedom Claims.
            </p>
          </div>

          <Button variant="outline" asChild className="w-full">
            <a href="https://zapier.com/apps/company-cam/integrations" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Company Cam on Zapier
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
