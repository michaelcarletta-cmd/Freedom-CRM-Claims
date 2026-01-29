import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2, RefreshCw, Zap, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface DarwinAutoSummaryProps {
  claimId: string;
  claim: any;
}

interface ClaimSummary {
  id: string;
  created_at: string;
  summary: string;
  key_facts: string[];
  next_actions: string[];
  risk_factors: string[];
  estimated_value: {
    low: number;
    likely: number;
    high: number;
  } | null;
}

export const DarwinAutoSummary = ({ claimId, claim }: DarwinAutoSummaryProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch existing summary
  const { data: existingSummary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["claim-auto-summary", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("darwin_analysis_results")
        .select("*")
        .eq("claim_id", claimId)
        .eq("analysis_type", "auto_summary")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      
      if (data?.result) {
        try {
          return JSON.parse(data.result) as ClaimSummary;
        } catch {
          return null;
        }
      }
      return null;
    },
  });

  // Generate summary mutation
  const generateSummary = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId,
          analysisType: "auto_summary",
          claim,
        },
      });

      if (error) throw error;
      
      // Save the analysis result to the database
      if (data?.result) {
        const { data: userData } = await supabase.auth.getUser();
        const { error: insertError } = await supabase.from("darwin_analysis_results").insert({
          claim_id: claimId,
          analysis_type: "auto_summary",
          input_summary: `Auto summary for ${claim?.claim_number || claimId}`,
          result: data.result,
          created_by: userData.user?.id,
        });
        
        if (insertError) {
          console.error("Failed to save summary:", insertError);
        }
      }
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["claim-auto-summary", claimId] });
      toast({
        title: "Summary generated",
        description: "Darwin has analyzed the claim and generated a summary",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    },
  });

  // Auto-refresh effect - check for new uploads
  useEffect(() => {
    if (!autoRefresh) return;

    const channel = supabase
      .channel(`claim-files-${claimId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "claim_files",
          filter: `claim_id=eq.${claimId}`,
        },
        () => {
          // New file uploaded, trigger summary regeneration
          toast({
            title: "New document detected",
            description: "Updating claim summary...",
          });
          generateSummary.mutate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [autoRefresh, claimId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Auto Claim Summary
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" className="text-sm">
                Auto-refresh on upload
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingSummary ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : existingSummary ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Last updated: {format(new Date(existingSummary.created_at), "MMM d, yyyy h:mm a")}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generateSummary.mutate()}
                disabled={generateSummary.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${generateSummary.isPending ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{existingSummary.summary}</p>
            </div>

            {existingSummary.key_facts && existingSummary.key_facts.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Key Facts
                </h4>
                <ul className="space-y-1">
                  {existingSummary.key_facts.map((fact, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {existingSummary.next_actions && existingSummary.next_actions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Recommended Next Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {existingSummary.next_actions.map((action, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {action}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {existingSummary.risk_factors && existingSummary.risk_factors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-orange-600">Risk Factors</h4>
                <ul className="space-y-1">
                  {existingSummary.risk_factors.map((risk, i) => (
                    <li key={i} className="text-sm text-orange-600/80 flex items-start gap-2">
                      <span>⚠</span>
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {existingSummary.estimated_value && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Low Estimate</p>
                  <p className="font-semibold">{formatCurrency(existingSummary.estimated_value.low)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Likely</p>
                  <p className="font-semibold text-primary">{formatCurrency(existingSummary.estimated_value.likely)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">High Estimate</p>
                  <p className="font-semibold">{formatCurrency(existingSummary.estimated_value.high)}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              No summary generated yet. Darwin will analyze all claim data and documents.
            </p>
            <Button
              onClick={() => generateSummary.mutate()}
              disabled={generateSummary.isPending}
            >
              {generateSummary.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing claim...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Generate Summary
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
