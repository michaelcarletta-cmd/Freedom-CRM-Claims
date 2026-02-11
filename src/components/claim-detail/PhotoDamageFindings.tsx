import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, AlertTriangle, Wrench, Sparkles, HelpCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DamageFinding {
  area: string;
  items: {
    item: string;
    action: "replace" | "repair" | "clean_restore" | "investigate";
    why: string;
    evidence?: string[];
    confidence: number;
  }[];
}

interface XactimatePlanItem {
  area: string;
  trade_groups: {
    category_code: string;
    items: {
      selector_hint: string;
      reason: string;
      linked_replace_item: string;
    }[];
  }[];
}

interface AnalysisResult {
  damage_findings: DamageFinding[];
  xactimate_plan: XactimatePlanItem[];
  notes?: string[];
  questions?: string[];
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  replace: { label: "Replace", icon: <Trash2 className="h-3 w-3" />, className: "bg-destructive/15 text-destructive border-destructive/30" },
  repair: { label: "Repair", icon: <Wrench className="h-3 w-3" />, className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  clean_restore: { label: "Clean/Restore", icon: <Sparkles className="h-3 w-3" />, className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  investigate: { label: "Investigate", icon: <HelpCircle className="h-3 w-3" />, className: "bg-muted text-muted-foreground border-border" },
};

export function PhotoDamageFindings({ claimId, photoCount }: { claimId: string; photoCount: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("photo-damage-analyzer", {
        body: { claimId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      toast.success("Photo damage analysis complete");
    } catch (err: any) {
      console.error("Analysis error:", err);
      toast.error(err.message || "Failed to analyze photos");
    } finally {
      setLoading(false);
    }
  };

  if (!result) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Photo Damage Analyzer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Analyze uploaded photos to identify damage, generate repair/replace recommendations, and create an Xactimate add-item plan.
          </p>
          <Button onClick={runAnalysis} disabled={loading || photoCount === 0} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "Analyzing Photos..." : `Analyze ${photoCount} Photo${photoCount !== 1 ? "s" : ""}`}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Damage Findings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Damage Findings
            </CardTitle>
            <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading} className="gap-1">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Re-analyze
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Area</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="w-[120px]">Action</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.damage_findings.flatMap((finding) =>
                finding.items.map((item, idx) => {
                  const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.investigate;
                  return (
                    <TableRow key={`${finding.area}-${idx}`}>
                      {idx === 0 ? (
                        <TableCell rowSpan={finding.items.length} className="font-medium align-top border-r">
                          {finding.area}
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium">{item.item}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${config.className}`}>
                          {config.icon}
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.why}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Xactimate Add-Item Plan */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Xactimate Add-Item Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Area</TableHead>
                <TableHead className="w-[80px]">CAT</TableHead>
                <TableHead>Selector Hint</TableHead>
                <TableHead>Linked Item</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.xactimate_plan.flatMap((plan) =>
                plan.trade_groups.flatMap((group, gIdx) =>
                  group.items.map((item, iIdx) => (
                    <TableRow key={`${plan.area}-${gIdx}-${iIdx}`}>
                      {gIdx === 0 && iIdx === 0 ? (
                        <TableCell
                          rowSpan={plan.trade_groups.reduce((sum, g) => sum + g.items.length, 0)}
                          className="font-medium align-top border-r"
                        >
                          {plan.area}
                        </TableCell>
                      ) : null}
                      {iIdx === 0 ? (
                        <TableCell rowSpan={group.items.length} className="align-top">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {group.category_code}
                          </Badge>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium">{item.selector_hint}</TableCell>
                      <TableCell className="text-sm">{item.linked_replace_item}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.reason}</TableCell>
                    </TableRow>
                  ))
                )
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notes & Questions */}
      {((result.notes && result.notes.length > 0) || (result.questions && result.questions.length > 0)) && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {result.notes && result.notes.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Notes</p>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  {result.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
            {result.questions && result.questions.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Questions for Inspector</p>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  {result.questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
