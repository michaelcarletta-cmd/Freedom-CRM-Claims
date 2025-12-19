import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Zap, ArrowRight, CheckCircle2, Download, Camera, FileText, Bell, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Make scenario templates
const scenarioTemplates = {
  companyCamPhotoSync: {
    name: "Company Cam Photo Sync",
    description: "Import photos from Company Cam projects to claims",
    icon: Camera,
    blueprint: {
      name: "Company Cam to Freedom Claims Photo Sync",
      flow: [
        {
          id: 1,
          module: "gateway:CustomWebHook",
          version: 1,
          parameters: {
            hook: "{{COMPANY_CAM_WEBHOOK_ID}}",
            maxResults: 1
          },
          mapper: {},
          metadata: {
            designer: { x: 0, y: 0 },
            restore: {},
            expect: [
              { name: "photo", type: "collection" },
              { name: "project", type: "collection" }
            ]
          }
        },
        {
          id: 2,
          module: "http:ActionSendData",
          version: 3,
          parameters: {},
          mapper: {
            url: `${SUPABASE_URL}/functions/v1/automation-webhook`,
            method: "POST",
            headers: [
              { name: "Content-Type", value: "application/json" }
            ],
            body: JSON.stringify({
              action: "import_photo",
              data: {
                photo_url: "{{1.photo.uri}}",
                photo_name: "{{1.photo.photo_name}}",
                policy_number: "{{1.project.name}}",
                category: "Inspection Photos"
              }
            }),
            parseResponse: true
          },
          metadata: {
            designer: { x: 300, y: 0 }
          }
        }
      ],
      metadata: {
        version: 1,
        scenario: {
          roundtrips: 1,
          maxErrors: 3,
          autoCommit: true,
          autoCommitTriggerLast: true,
          sequential: false,
          confidential: false,
          dataloss: false,
          dlq: false
        },
        designer: { orphans: [] }
      }
    }
  },
  formSubmissionClaim: {
    name: "Form to Claim Creation",
    description: "Create claims from Typeform, JotForm, or Google Forms",
    icon: FileText,
    blueprint: {
      name: "Form Submission to Freedom Claims",
      flow: [
        {
          id: 1,
          module: "gateway:CustomWebHook",
          version: 1,
          parameters: {
            hook: "{{FORM_WEBHOOK_ID}}",
            maxResults: 1
          },
          mapper: {},
          metadata: {
            designer: { x: 0, y: 0 },
            restore: {},
            expect: [
              { name: "policyholder_name", type: "text" },
              { name: "policyholder_email", type: "text" },
              { name: "policyholder_phone", type: "text" },
              { name: "policyholder_address", type: "text" },
              { name: "loss_description", type: "text" },
              { name: "loss_date", type: "date" }
            ]
          }
        },
        {
          id: 2,
          module: "http:ActionSendData",
          version: 3,
          parameters: {},
          mapper: {
            url: `${SUPABASE_URL}/functions/v1/automation-webhook`,
            method: "POST",
            headers: [
              { name: "Content-Type", value: "application/json" },
              { name: "x-webhook-signature", value: "{{WEBHOOK_SECRET}}" }
            ],
            body: JSON.stringify({
              action: "create_claim",
              data: {
                policyholder_name: "{{1.policyholder_name}}",
                policyholder_email: "{{1.policyholder_email}}",
                policyholder_phone: "{{1.policyholder_phone}}",
                policyholder_address: "{{1.policyholder_address}}",
                loss_description: "{{1.loss_description}}",
                loss_date: "{{1.loss_date}}"
              }
            }),
            parseResponse: true
          },
          metadata: {
            designer: { x: 300, y: 0 }
          }
        }
      ],
      metadata: {
        version: 1,
        scenario: {
          roundtrips: 1,
          maxErrors: 3,
          autoCommit: true,
          sequential: false
        }
      }
    }
  },
  slackNotifications: {
    name: "Slack Notifications",
    description: "Send claim updates to Slack channels",
    icon: Bell,
    blueprint: {
      name: "Freedom Claims to Slack Notifications",
      flow: [
        {
          id: 1,
          module: "gateway:CustomWebHook",
          version: 1,
          parameters: {
            hook: "{{FREEDOM_CLAIMS_WEBHOOK_ID}}",
            maxResults: 1
          },
          mapper: {},
          metadata: {
            designer: { x: 0, y: 0 },
            expect: [
              { name: "event_type", type: "text" },
              { name: "claim_number", type: "text" },
              { name: "policyholder_name", type: "text" },
              { name: "message", type: "text" }
            ]
          }
        },
        {
          id: 2,
          module: "slack:ActionPostMessage",
          version: 1,
          parameters: {},
          mapper: {
            channel: "{{SLACK_CHANNEL_ID}}",
            text: "🏠 *{{1.event_type}}*\n\nClaim: {{1.claim_number}}\nClient: {{1.policyholder_name}}\n\n{{1.message}}"
          },
          metadata: {
            designer: { x: 300, y: 0 }
          }
        }
      ],
      metadata: {
        version: 1,
        scenario: {
          roundtrips: 1,
          maxErrors: 3,
          autoCommit: true
        }
      }
    }
  },
  googleSheetsSync: {
    name: "Google Sheets Sync",
    description: "Export claim data to Google Sheets for reporting",
    icon: Database,
    blueprint: {
      name: "Freedom Claims to Google Sheets",
      flow: [
        {
          id: 1,
          module: "gateway:CustomWebHook",
          version: 1,
          parameters: {
            hook: "{{FREEDOM_CLAIMS_WEBHOOK_ID}}",
            maxResults: 1
          },
          mapper: {},
          metadata: {
            designer: { x: 0, y: 0 },
            expect: [
              { name: "claim_number", type: "text" },
              { name: "policyholder_name", type: "text" },
              { name: "status", type: "text" },
              { name: "insurance_company", type: "text" },
              { name: "loss_type", type: "text" },
              { name: "loss_date", type: "date" },
              { name: "settlement_amount", type: "number" }
            ]
          }
        },
        {
          id: 2,
          module: "google-sheets:ActionAddRow",
          version: 4,
          parameters: {},
          mapper: {
            spreadsheetId: "{{SPREADSHEET_ID}}",
            sheetId: "{{SHEET_ID}}",
            values: {
              "0": "{{1.claim_number}}",
              "1": "{{1.policyholder_name}}",
              "2": "{{1.status}}",
              "3": "{{1.insurance_company}}",
              "4": "{{1.loss_type}}",
              "5": "{{1.loss_date}}",
              "6": "{{1.settlement_amount}}"
            },
            insertDataOption: "INSERT_ROWS"
          },
          metadata: {
            designer: { x: 300, y: 0 }
          }
        }
      ],
      metadata: {
        version: 1,
        scenario: {
          roundtrips: 1,
          maxErrors: 3,
          autoCommit: true
        }
      }
    }
  }
};

interface MakeIntegrationSettingsProps {
  embedded?: boolean;
}

export function MakeIntegrationSettings({ embedded }: MakeIntegrationSettingsProps) {
  const { toast } = useToast();

  const downloadTemplate = (templateKey: keyof typeof scenarioTemplates) => {
    const template = scenarioTemplates[templateKey];
    const blob = new Blob([JSON.stringify(template.blueprint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `make-scenario-${templateKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Template Downloaded",
      description: `${template.name} scenario template has been downloaded. Import it into Make to get started.`,
    });
  };

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
                <li>Download a scenario template below</li>
                <li>Import the JSON into Make</li>
                <li>Configure your connections and activate</li>
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
                <code className="text-xs break-all">POST {SUPABASE_URL}/functions/v1/automation-webhook</code>
              </div>
              <div className="pt-2 border-t">
                <span className="text-muted-foreground">Inbound Email:</span>
                <br />
                <code className="text-xs break-all">POST {SUPABASE_URL}/functions/v1/inbound-email</code>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
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
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Scenario Templates
          </CardTitle>
          <CardDescription>
            Download pre-built scenario templates and import them into Make to get started quickly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(scenarioTemplates).map(([key, template]) => {
              const Icon = template.icon;
              return (
                <div
                  key={key}
                  className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm">{template.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {template.description}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => downloadTemplate(key as keyof typeof scenarioTemplates)}
                      >
                        <Download className="h-3 w-3 mr-2" />
                        Download Template
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 rounded-lg bg-muted/50 border">
            <h4 className="font-semibold text-sm mb-2">How to Import a Template</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Download the template JSON file</li>
              <li>In Make, create a new scenario</li>
              <li>Click the three dots menu → Import Blueprint</li>
              <li>Upload the downloaded JSON file</li>
              <li>Replace placeholder values (marked with {`{{...}}`}) with your actual credentials</li>
              <li>Save and activate your scenario</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Setup: Company Cam Photo Sync</CardTitle>
          <CardDescription>
            Step-by-step guide if you prefer to build the scenario manually
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
