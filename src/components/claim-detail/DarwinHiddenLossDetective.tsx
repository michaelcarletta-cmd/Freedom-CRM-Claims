import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { Search, AlertTriangle, CheckCircle, DollarSign, Lightbulb } from "lucide-react";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  loss_type: string;
  category: string;
  item_name: string;
  description: string;
  common_locations: string | null;
  detection_tips: string | null;
  typical_cost_range: string | null;
}

interface ClaimCheck {
  id: string;
  checklist_item_id: string;
  is_checked: boolean;
  is_damage_found: boolean | null;
  damage_description: string | null;
  estimated_cost: number | null;
}

interface DarwinHiddenLossDetectiveProps {
  claimId: string;
  claim: any;
}

export const DarwinHiddenLossDetective = ({ claimId, claim }: DarwinHiddenLossDetectiveProps) => {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [claimChecks, setClaimChecks] = useState<Record<string, ClaimCheck>>({});
  const [loading, setLoading] = useState(true);
  const [selectedLossType, setSelectedLossType] = useState<string>("all");

  // Determine loss type from claim
  useEffect(() => {
    if (claim?.loss_type) {
      const lt = claim.loss_type.toLowerCase();
      if (lt.includes("water") || lt.includes("flood") || lt.includes("pipe")) {
        setSelectedLossType("water");
      } else if (lt.includes("fire") || lt.includes("smoke")) {
        setSelectedLossType("fire");
      } else if (lt.includes("wind") || lt.includes("storm")) {
        setSelectedLossType("wind");
      } else if (lt.includes("hail")) {
        setSelectedLossType("hail");
      }
    }
  }, [claim]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch checklist items
      const { data: items, error: itemsError } = await supabase
        .from("hidden_loss_checklist_items")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (itemsError) {
        console.error("Error fetching checklist:", itemsError);
      } else {
        setChecklistItems(items || []);
      }

      // Fetch existing checks for this claim
      const { data: checks, error: checksError } = await supabase
        .from("claim_hidden_loss_checks")
        .select("*")
        .eq("claim_id", claimId);

      if (checksError) {
        console.error("Error fetching checks:", checksError);
      } else {
        const checksMap: Record<string, ClaimCheck> = {};
        (checks || []).forEach(c => {
          if (c.checklist_item_id) {
            checksMap[c.checklist_item_id] = c;
          }
        });
        setClaimChecks(checksMap);
      }

      setLoading(false);
    };

    fetchData();
  }, [claimId]);

  const handleCheckItem = async (item: ChecklistItem, isDamageFound: boolean | null, description?: string, cost?: number) => {
    const { data: userData } = await supabase.auth.getUser();
    const existingCheck = claimChecks[item.id];

    if (existingCheck) {
      const { error } = await supabase
        .from("claim_hidden_loss_checks")
        .update({
          is_checked: true,
          is_damage_found: isDamageFound,
          damage_description: description || null,
          estimated_cost: cost || null,
          checked_at: new Date().toISOString(),
          checked_by: userData.user?.id,
        })
        .eq("id", existingCheck.id);

      if (error) {
        toast.error("Failed to update");
        return;
      }
    } else {
      const { error } = await supabase
        .from("claim_hidden_loss_checks")
        .insert({
          claim_id: claimId,
          checklist_item_id: item.id,
          is_checked: true,
          is_damage_found: isDamageFound,
          damage_description: description || null,
          estimated_cost: cost || null,
          checked_by: userData.user?.id,
          checked_at: new Date().toISOString(),
        });

      if (error) {
        toast.error("Failed to save");
        return;
      }
    }

    // Refresh checks
    const { data: checks } = await supabase
      .from("claim_hidden_loss_checks")
      .select("*")
      .eq("claim_id", claimId);

    const checksMap: Record<string, ClaimCheck> = {};
    (checks || []).forEach(c => {
      if (c.checklist_item_id) {
        checksMap[c.checklist_item_id] = c;
      }
    });
    setClaimChecks(checksMap);

    toast.success(isDamageFound ? "Damage recorded" : "Item checked - no damage");
  };

  // Filter items by loss type
  const filteredItems = selectedLossType === "all" 
    ? checklistItems 
    : checklistItems.filter(i => i.loss_type === selectedLossType);

  // Group by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  // Calculate stats
  const checkedCount = Object.values(claimChecks).filter(c => c.is_checked).length;
  const damageFoundCount = Object.values(claimChecks).filter(c => c.is_damage_found).length;
  const totalEstimatedCost = Object.values(claimChecks)
    .filter(c => c.estimated_cost)
    .reduce((sum, c) => sum + (c.estimated_cost || 0), 0);

  const lossTypes = [...new Set(checklistItems.map(i => i.loss_type))];

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
          <Search className="h-5 w-5 text-amber-600" />
          Hidden Loss Detective
        </CardTitle>
        <CardDescription>
          Uncover commonly missed damages for PA/NJ claims
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Loss Type Filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant={selectedLossType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedLossType("all")}
          >
            All Types
          </Button>
          {lossTypes.map(type => (
            <Button
              key={type}
              variant={selectedLossType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedLossType(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-sm text-muted-foreground">Items Checked</p>
            <p className="text-xl font-bold">{checkedCount} / {filteredItems.length}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-center">
            <p className="text-sm text-amber-700 dark:text-amber-400">Damage Found</p>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{damageFoundCount}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
            <p className="text-sm text-green-700 dark:text-green-400">Est. Hidden Value</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-400">
              ${totalEstimatedCost.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Checklist */}
        <Accordion type="multiple" className="space-y-2">
          {Object.entries(groupedItems).map(([category, items]) => (
            <AccordionItem key={category} value={category} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{category}</span>
                  <Badge variant="secondary">{items.length} items</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {items.map((item) => {
                    const check = claimChecks[item.id];
                    const isChecked = check?.is_checked;
                    const hasDamage = check?.is_damage_found;

                    return (
                      <div
                        key={item.id}
                        className={`border rounded-lg p-4 ${
                          hasDamage 
                            ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" 
                            : isChecked 
                            ? "border-green-300 bg-green-50 dark:bg-green-950/20"
                            : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {hasDamage && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                              {isChecked && !hasDamage && <CheckCircle className="h-4 w-4 text-green-600" />}
                              <span className="font-medium">{item.item_name}</span>
                              {item.typical_cost_range && (
                                <Badge variant="outline" className="text-xs">
                                  <DollarSign className="h-3 w-3" />
                                  {item.typical_cost_range}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                            {item.common_locations && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <strong>Where to look:</strong> {item.common_locations}
                              </p>
                            )}
                            {item.detection_tips && (
                              <p className="text-xs text-blue-700 dark:text-blue-400 mt-1 flex items-center gap-1">
                                <Lightbulb className="h-3 w-3" /> {item.detection_tips}
                              </p>
                            )}

                            {check?.damage_description && (
                              <p className="text-sm mt-2 p-2 bg-background rounded border">
                                <strong>Noted:</strong> {check.damage_description}
                                {check.estimated_cost && ` — Est. $${check.estimated_cost.toLocaleString()}`}
                              </p>
                            )}
                          </div>

                          {!isChecked && (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCheckItem(item, false)}
                              >
                                No Damage
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  const desc = prompt("Describe the damage found:");
                                  const cost = prompt("Estimated repair cost (numbers only):");
                                  if (desc) {
                                    handleCheckItem(item, true, desc, cost ? parseFloat(cost) : undefined);
                                  }
                                }}
                              >
                                Found Damage
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};
