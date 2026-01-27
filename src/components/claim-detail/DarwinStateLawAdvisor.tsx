import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Clock, AlertTriangle, Copy, FileText } from "lucide-react";
import { toast } from "sonner";

interface Regulation {
  id: string;
  state_code: string;
  state_name: string;
  regulation_type: string;
  regulation_title: string;
  regulation_citation: string;
  deadline_days: number | null;
  description: string;
  consequence_description: string | null;
}

interface DarwinStateLawAdvisorProps {
  claimId: string;
  claim: any;
}

export const DarwinStateLawAdvisor = ({ claimId, claim }: DarwinStateLawAdvisorProps) => {
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string>("PA");

  // Determine state from claim address
  useEffect(() => {
    if (claim?.policyholder_address) {
      const address = claim.policyholder_address.toUpperCase();
      if (address.includes("NJ") || address.includes("NEW JERSEY")) {
        setSelectedState("NJ");
      } else if (address.includes("PA") || address.includes("PENNSYLVANIA")) {
        setSelectedState("PA");
      }
    }
  }, [claim]);

  useEffect(() => {
    const fetchRegulations = async () => {
      const { data, error } = await supabase
        .from("state_insurance_regulations")
        .select("*")
        .order("regulation_type", { ascending: true });

      if (error) {
        console.error("Error fetching regulations:", error);
        toast.error("Failed to load state regulations");
      } else {
        setRegulations(data || []);
      }
      setLoading(false);
    };

    fetchRegulations();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getRegulationIcon = (type: string) => {
    switch (type) {
      case "insurer_response":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "bad_faith":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "pol_deadline":
        return <FileText className="h-4 w-4 text-amber-600" />;
      case "unfair_claims":
        return <Scale className="h-4 w-4 text-purple-600" />;
      default:
        return <Scale className="h-4 w-4" />;
    }
  };

  const getRegulationBadgeColor = (type: string) => {
    switch (type) {
      case "insurer_response":
        return "bg-blue-100 text-blue-800";
      case "bad_faith":
        return "bg-red-100 text-red-800";
      case "pol_deadline":
        return "bg-amber-100 text-amber-800";
      case "unfair_claims":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const filteredRegulations = regulations.filter(r => r.state_code === selectedState);

  const groupedRegulations = filteredRegulations.reduce((acc, reg) => {
    if (!acc[reg.regulation_type]) {
      acc[reg.regulation_type] = [];
    }
    acc[reg.regulation_type].push(reg);
    return acc;
  }, {} as Record<string, Regulation[]>);

  const typeLabels: Record<string, string> = {
    insurer_response: "Insurer Response Deadlines",
    bad_faith: "Bad Faith Laws",
    pol_deadline: "Proof of Loss Requirements",
    unfair_claims: "Unfair Claims Practices"
  };

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
          <Scale className="h-5 w-5 text-purple-600" />
          State Law Advisor
        </CardTitle>
        <CardDescription>
          PA & NJ insurance regulations, deadlines, and bad faith statutes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedState} onValueChange={setSelectedState}>
          <TabsList className="flex flex-col sm:flex-row w-full h-auto gap-1 p-1 mb-4">
            <TabsTrigger value="PA" className="w-full justify-center gap-2 px-3 py-2">
              <span>Pennsylvania</span>
            </TabsTrigger>
            <TabsTrigger value="NJ" className="w-full justify-center gap-2 px-3 py-2">
              <span>New Jersey</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedState}>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-6">
                {Object.entries(groupedRegulations).map(([type, regs]) => (
                  <div key={type} className="space-y-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      {getRegulationIcon(type)}
                      {typeLabels[type] || type}
                    </h3>
                    
                    <div className="space-y-3">
                      {regs.map((reg) => (
                        <div
                          key={reg.id}
                          className="border rounded-lg p-4 bg-muted/30 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{reg.regulation_title}</span>
                                <Badge variant="outline" className={getRegulationBadgeColor(type)}>
                                  {reg.regulation_citation}
                                </Badge>
                                {reg.deadline_days && (
                                  <Badge variant="secondary">
                                    {reg.deadline_days} days
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {reg.description}
                              </p>
                              {reg.consequence_description && (
                                <p className="text-sm text-amber-700 dark:text-amber-400 mt-2 font-medium">
                                  ⚠️ {reg.consequence_description}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(
                                `${reg.regulation_title} (${reg.regulation_citation}): ${reg.description}`,
                                "Citation"
                              )}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
