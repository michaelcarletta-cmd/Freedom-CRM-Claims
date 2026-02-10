import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, CheckCircle2, AlertTriangle, Bot, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InventoryItem {
  id: string;
  room_name: string;
  item_name: string;
  item_description: string | null;
  quantity: number;
  original_purchase_price: number | null;
  replacement_cost: number | null;
  actual_cash_value: number | null;
  condition_before_loss: string | null;
  manufacturer: string | null;
  model_number: string | null;
  is_total_loss: boolean;
  source?: string;
  ai_confidence?: number;
  brand_confirmed?: boolean;
  model_confirmed?: boolean;
  price_confirmed?: boolean;
  pricing_source?: string;
  pricing_rationale?: string;
  category?: string;
  needs_review?: boolean;
  depreciation_rate?: number;
  age_years?: number;
}

const CONDITIONS: Record<string, string> = {
  new: "New/Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

interface InventoryTableProps {
  items: InventoryItem[];
  loading: boolean;
  onRefresh: () => void;
}

export const InventoryTable = ({ items, loading, onRefresh }: InventoryTableProps) => {
  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("claim_home_inventory").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Item removed");
      onRefresh();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No inventory items yet</p>
        <p className="text-sm">Use the Scan Photos tab or add items manually</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">RCV</TableHead>
              <TableHead className="text-right">ACV</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Confirmed</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className={item.needs_review ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                <TableCell>
                  {item.source === "ai_photo_scan" ? (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Bot className="h-3 w-3" /> AI
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1">
                      <User className="h-3 w-3" /> Manual
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium text-sm">{item.room_name}</TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm">{item.item_name}</p>
                    {item.manufacturer && (
                      <p className="text-xs text-muted-foreground">
                        {item.manufacturer} {item.model_number}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {item.category && <Badge variant="secondary" className="text-xs">{item.category}</Badge>}
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell className="text-right font-medium">
                  {item.replacement_cost ? `$${(item.replacement_cost * item.quantity).toLocaleString()}` : "—"}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {item.actual_cash_value ? `$${(item.actual_cash_value * item.quantity).toLocaleString()}` : "—"}
                  {item.depreciation_rate && item.age_years ? (
                    <p className="text-xs text-muted-foreground">
                      {Math.round(item.depreciation_rate * 100)}%/yr × {item.age_years}yr
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {CONDITIONS[item.condition_before_loss || ""] || item.condition_before_loss}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.source === "ai_photo_scan" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex gap-0.5">
                          {item.brand_confirmed ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          {item.price_confirmed ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Brand: {item.brand_confirmed ? "Confirmed" : "Unconfirmed"}</p>
                        <p>Price: {item.price_confirmed ? "Confirmed" : "Unconfirmed"}</p>
                        {item.pricing_source && <p>Source: {item.pricing_source}</p>}
                        {item.pricing_rationale && <p className="max-w-xs">{item.pricing_rationale}</p>}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
};
