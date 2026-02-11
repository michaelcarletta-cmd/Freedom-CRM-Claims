import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, AlertTriangle, Wrench, Sparkles, HelpCircle, Trash2, ChevronDown, ChevronRight, Camera, BarChart3 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PhotoEntry {
  photo_id: string;
  inferred_area: string;
  items: {
    item: string;
    material?: string | null;
    damage: string;
    action: "replace" | "repair" | "clean_restore" | "investigate";
    why: string;
    severity?: "minor" | "moderate" | "severe";
    trade_category_code?: string;
    confidence?: number;
  }[];
  missing_photo_request?: string | null;
}

interface DamageFinding {
  area: string;
  items: {
    item: string;
    material?: string;
    damage?: string;
    action: "replace" | "repair" | "clean_restore" | "investigate";
    why: string;
    severity?: string;
    trade_category_code?: string;
    confidence?: number;
    evidence_photo_ids?: string[];
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
  pass1_inventory: {
    photos: PhotoEntry[];
    notes: string[];
  };
  damage_findings?: DamageFinding[];
  xactimate_plan?: XactimatePlanItem[];
  notes?: string[];
  questions?: string[];
  stats: {
    total_photos: number;
    photos_processed: number;
    total_items_detected: number;
    deduped_items: number;
  };
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  replace: { label: "Replace", icon: <Trash2 className="h-3 w-3" />, className: "bg-destructive/15 text-destructive border-destructive/30" },
  repair: { label: "Repair", icon: <Wrench className="h-3 w-3" />, className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  clean_restore: { label: "Clean/Restore", icon: <Sparkles className="h-3 w-3" />, className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  investigate: { label: "Investigate", icon: <HelpCircle className="h-3 w-3" />, className: "bg-muted text-muted-foreground border-border" },
};

const SEVERITY_CONFIG: Record<string, string> = {
  minor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  moderate: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  severe: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export function PhotoDamageFindings({ claimId, photoCount }: { claimId: string; photoCount: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<"inventory" | "replace" | "xactimate">("replace");
  const [expandedPhotos, setExpandedPhotos] = useState<Set<string>>(new Set());

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("photo-damage-analyzer", {
        body: { claimId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      toast.success(`Analysis complete: ${data.stats?.total_items_detected || 0} items found across ${data.stats?.photos_processed || 0} photos`);
    } catch (err: any) {
      console.error("Analysis error:", err);
      toast.error(err.message || "Failed to analyze photos");
    } finally {
      setLoading(false);
    }
  };

  const togglePhoto = (photoId: string) => {
    setExpandedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const expandAll = () => {
    if (result?.pass1_inventory?.photos) {
      setExpandedPhotos(new Set(result.pass1_inventory.photos.map(p => p.photo_id)));
    }
  };

  const collapseAll = () => setExpandedPhotos(new Set());

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
            Analyzes every photo individually in batches, then deduplicates into a replace/repair list and Xactimate plan.
          </p>
          <Button onClick={runAnalysis} disabled={loading || photoCount === 0} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? `Analyzing ${photoCount} Photos (batched)...` : `Analyze ${photoCount} Photo${photoCount !== 1 ? "s" : ""}`}
          </Button>
          {loading && (
            <p className="text-xs text-muted-foreground mt-2">
              Processing in batches of 7. This may take a few minutes for large photo sets.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const stats = result.stats;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> {stats.photos_processed} photos</span>
              <span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" /> {stats.total_items_detected} items detected</span>
              {stats.deduped_items > 0 && <span className="text-muted-foreground">→ {stats.deduped_items} unique items</span>}
            </div>
            <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading} className="gap-1">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Re-analyze
            </Button>
          </div>
          {/* Tab buttons */}
          <div className="flex gap-1">
            <Button variant={activeTab === "replace" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("replace")}>
              Deduped Replace List
            </Button>
            <Button variant={activeTab === "xactimate" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("xactimate")}>
              Xactimate Plan
            </Button>
            <Button variant={activeTab === "inventory" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("inventory")}>
              Photo-by-Photo ({stats.photos_processed})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tab: Deduped Replace List */}
      {activeTab === "replace" && result.damage_findings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Replace / Repair List (Grouped by Area)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Area</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                  <TableHead className="w-[80px]">Severity</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead className="w-[80px]">Photos</TableHead>
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
                        <TableCell className="font-medium text-sm">{item.item}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 text-xs ${config.className}`}>
                            {config.icon}
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.severity && (
                            <Badge variant="outline" className={`text-xs ${SEVERITY_CONFIG[item.severity] || ""}`}>
                              {item.severity}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.why}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.evidence_photo_ids?.length || 0}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab: Xactimate Plan */}
      {activeTab === "xactimate" && result.xactimate_plan && (
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
                  <TableHead className="w-[130px]">Area</TableHead>
                  <TableHead className="w-[70px]">CAT</TableHead>
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
                        <TableCell className="font-medium text-sm">{item.selector_hint}</TableCell>
                        <TableCell className="text-sm">{item.linked_replace_item}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.reason}</TableCell>
                      </TableRow>
                    ))
                  )
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab: Photo-by-Photo Inventory */}
      {activeTab === "inventory" && result.pass1_inventory && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" />
                Photo-by-Photo Inventory
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {result.pass1_inventory.photos.map((photo) => (
              <Collapsible
                key={photo.photo_id}
                open={expandedPhotos.has(photo.photo_id)}
                onOpenChange={() => togglePhoto(photo.photo_id)}
              >
                <CollapsibleTrigger asChild>
                  <button className="flex items-center w-full gap-2 text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors text-sm">
                    {expandedPhotos.has(photo.photo_id) ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-medium truncate">{photo.inferred_area}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{photo.items.length} items</span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{photo.photo_id.slice(0, 8)}…</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-6 mb-2 border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="w-[90px]">Action</TableHead>
                          <TableHead className="w-[70px]">Severity</TableHead>
                          <TableHead>Why</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {photo.items.map((item, idx) => {
                          const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.investigate;
                          return (
                            <TableRow key={idx}>
                              <TableCell className="text-sm font-medium">{item.item}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`gap-1 text-xs ${config.className}`}>
                                  {config.icon}
                                  {config.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {item.severity && (
                                  <Badge variant="outline" className={`text-xs ${SEVERITY_CONFIG[item.severity] || ""}`}>
                                    {item.severity}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.why}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {photo.missing_photo_request && (
                      <div className="px-3 py-2 bg-muted/50 text-xs text-muted-foreground border-t">
                        📷 Needed: {photo.missing_photo_request}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Notes & Questions */}
      {((result.notes && result.notes.length > 0) || (result.questions && result.questions.length > 0) || (result.pass1_inventory?.notes && result.pass1_inventory.notes.length > 0)) && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {result.pass1_inventory?.notes && result.pass1_inventory.notes.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Processing Notes</p>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  {result.pass1_inventory.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
            {result.notes && result.notes.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Analysis Notes</p>
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
