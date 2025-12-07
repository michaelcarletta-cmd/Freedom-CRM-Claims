import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Zap, ArrowRight, CheckCircle2 } from "lucide-react";

export function MakeIntegrationSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Make (Integromat) Integration
          </CardTitle>
          <CardDescription>
            Connect Freedom Claims with thousands of apps using Make's powerful automation platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
              <h4 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                What You Can Automate
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Sync photos from Company Cam to claims</li>
                <li>• Create claims from form submissions</li>
                <li>• Send data to Google Sheets, Airtable, etc.</li>
                <li>• Trigger notifications in Slack or Teams</li>
                <li>• Connect with 1,500+ apps</li>
              </ul>
            </div>
            
            <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
              <h4 className="font-semibold flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Getting Started
              </h4>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Create a free Make account</li>
                <li>Create a new scenario</li>
                <li>Use HTTP/Webhook module to connect</li>
                <li>Point webhooks to your edge functions</li>
              </ol>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
            <h4 className="font-semibold mb-2">Available Endpoints</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Use Make's HTTP module to send data to these Freedom Claims endpoints:
            </p>
            <div className="space-y-2 text-sm font-mono bg-background rounded p-3">
              <div>
                <span className="text-muted-foreground">Automations:</span>
                <br />
                <code className="text-xs">POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/automation-webhook</code>
              </div>
              <div className="pt-2 border-t">
                <span className="text-muted-foreground">Inbound Email:</span>
                <br />
                <code className="text-xs">POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/inbound-email</code>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href="https://www.make.com/en/register" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Create Make Account
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="https://www.make.com/en/integrations" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Browse Make Integrations
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Example: Company Cam Photo Sync</CardTitle>
          <CardDescription>
            Automatically import photos from Company Cam projects to claims
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <strong>In Make:</strong> Create a new scenario with Company Cam trigger "Watch Photos"
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <strong>Add HTTP Module:</strong> Configure a POST request to the automation-webhook endpoint
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <strong>Map Fields:</strong> Map photo URL, project name, and other data from Company Cam
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <strong>Activate:</strong> Turn on your scenario to start syncing photos automatically
              </div>
            </li>
          </ol>

          <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-sm">
            <strong className="text-amber-600">Tip:</strong> Name your Company Cam projects with the policy number (e.g., "POL-123456") for automatic claim matching.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
