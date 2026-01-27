import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Copy, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface QualifyingTemplate {
  id: string;
  template_type: string;
  template_name: string;
  template_text: string;
  usage_context: string | null;
  state_specific: string | null;
}

interface DarwinQualifyingLanguageProps {
  claimId: string;
  claim: any;
}

const TYPE_LABELS: Record<string, string> = {
  pol: "Proof of Loss",
  estimate: "Estimates",
  inventory: "Contents/Inventory",
  correspondence: "Correspondence",
  general: "General/Legal",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  pol: <FileText className="h-4 w-4" />,
  estimate: <FileText className="h-4 w-4" />,
  inventory: <FileText className="h-4 w-4" />,
  correspondence: <FileText className="h-4 w-4" />,
  general: <AlertTriangle className="h-4 w-4" />,
};

export const DarwinQualifyingLanguage = ({ claimId, claim }: DarwinQualifyingLanguageProps) => {
  const [templates, setTemplates] = useState<QualifyingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("pol");
  const [claimState, setClaimState] = useState<string | null>(null);

  // Determine state from claim address
  useEffect(() => {
    if (claim?.policyholder_address) {
      const address = claim.policyholder_address.toUpperCase();
      if (address.includes("NJ") || address.includes("NEW JERSEY")) {
        setClaimState("NJ");
      } else if (address.includes("PA") || address.includes("PENNSYLVANIA")) {
        setClaimState("PA");
      }
    }
  }, [claim]);

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data, error } = await supabase
        .from("qualifying_language_templates")
        .select("*")
        .eq("is_active", true)
        .order("template_type", { ascending: true });

      if (error) {
        console.error("Error fetching templates:", error);
      } else {
        setTemplates(data || []);
      }
      setLoading(false);
    };

    fetchTemplates();
  }, []);

  const copyToClipboard = (text: string, name: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`"${name}" copied to clipboard`);
  };

  const copyAllForType = (type: string) => {
    const typeTemplates = templates.filter(t => t.template_type === type);
    const combined = typeTemplates.map(t => `--- ${t.template_name} ---\n${t.template_text}`).join("\n\n");
    navigator.clipboard.writeText(combined);
    toast.success(`All ${TYPE_LABELS[type]} language copied`);
  };

  // Filter templates - show universal + state-specific for claim's state
  const filteredTemplates = templates.filter(t => 
    t.template_type === selectedType && 
    (t.state_specific === null || t.state_specific === claimState)
  );

  const templateTypes = [...new Set(templates.map(t => t.template_type))];

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Qualifying Language Generator
        </CardTitle>
        <CardDescription>
          Protective language for PA/NJ submissions — prevents carrier overreach
        </CardDescription>
        {claimState && (
          <Badge variant="outline" className="w-fit mt-2">
            Showing templates for: {claimState === "PA" ? "Pennsylvania" : "New Jersey"}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={selectedType} onValueChange={setSelectedType}>
          <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
            {templateTypes.map(type => (
              <TabsTrigger key={type} value={type} className="flex items-center gap-1">
                {TYPE_ICONS[type]}
                {TYPE_LABELS[type] || type}
              </TabsTrigger>
            ))}
          </TabsList>

          {templateTypes.map(type => (
            <TabsContent key={type} value={type}>
              <div className="flex justify-end mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyAllForType(type)}
                >
                  <Copy className="h-4 w-4 mr-1" /> Copy All {TYPE_LABELS[type]}
                </Button>
              </div>
              
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {templates
                    .filter(t => t.template_type === type && (t.state_specific === null || t.state_specific === claimState))
                    .map((template) => (
                      <div
                        key={template.id}
                        className="border rounded-lg p-4 bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{template.template_name}</span>
                              {template.state_specific && (
                                <Badge variant="secondary" className="text-xs">
                                  {template.state_specific === "PA" ? "Pennsylvania" : "New Jersey"} specific
                                </Badge>
                              )}
                            </div>
                            {template.usage_context && (
                              <p className="text-xs text-muted-foreground mt-1">
                                📌 {template.usage_context}
                              </p>
                            )}
                            <div className="mt-3 p-3 bg-background rounded border text-sm">
                              {template.template_text}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(template.template_text, template.template_name)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        {/* Quick Tips */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">💡 Why Use Qualifying Language?</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
            <li>• <strong>Prevents carrier lock-in</strong> — Keeps the door open for supplements</li>
            <li>• <strong>Documents non-expert status</strong> — Shifts burden back to carrier</li>
            <li>• <strong>Creates paper trail</strong> — Essential for PA/NJ bad faith claims</li>
            <li>• <strong>"Substantial compliance" protection</strong> — Courts favor policyholders who try</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
