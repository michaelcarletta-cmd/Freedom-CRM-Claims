import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, DollarSign } from "lucide-react";
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
  source?: string;
  category?: string;
  pricing_source?: string;
  pricing_rationale?: string;
}

interface InventorySummaryProps {
  items: InventoryItem[];
}

export const InventorySummary = ({ items }: InventorySummaryProps) => {
  const totalRCV = items.reduce((sum, i) => sum + (i.replacement_cost || 0) * i.quantity, 0);
  const totalACV = items.reduce((sum, i) => sum + (i.actual_cash_value || 0) * i.quantity, 0);
  const totalOriginal = items.reduce((sum, i) => sum + (i.original_purchase_price || 0) * i.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  const roomCounts = items.reduce((acc, item) => {
    acc[item.room_name] = (acc[item.room_name] || 0) + item.quantity;
    return acc;
  }, {} as Record<string, number>);

  const categoryCounts = items.reduce((acc, item) => {
    const cat = item.category || "Uncategorized";
    acc[cat] = (acc[cat] || 0) + item.quantity;
    return acc;
  }, {} as Record<string, number>);

  const categoryTotals = items.reduce((acc, item) => {
    const cat = item.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = { rcv: 0, acv: 0, count: 0 };
    acc[cat].rcv += (item.replacement_cost || 0) * item.quantity;
    acc[cat].acv += (item.actual_cash_value || 0) * item.quantity;
    acc[cat].count += item.quantity;
    return acc;
  }, {} as Record<string, { rcv: number; acv: number; count: number }>);

  const exportInventory = () => {
    let csv = "Room,Item Name,Description,Qty,Original Price,RCV,ACV,Condition,Manufacturer,Model,Category,Source,Pricing Source,Pricing Rationale\n";
    items.forEach((item) => {
      csv += `"${item.room_name}","${item.item_name}","${item.item_description || ""}",${item.quantity},${item.original_purchase_price || ""},${item.replacement_cost || ""},${item.actual_cash_value || ""},"${item.condition_before_loss || ""}","${item.manufacturer || ""}","${item.model_number || ""}","${item.category || ""}","${item.source || "manual"}","${item.pricing_source || ""}","${(item.pricing_rationale || "").replace(/"/g, '""')}"\n`;
    });
    navigator.clipboard.writeText(csv);
    toast.success("Inventory copied as CSV");
  };

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">Total Items</p>
          <p className="text-2xl font-bold">{totalItems}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">Original Value</p>
          <p className="text-2xl font-bold">${totalOriginal.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 text-center">
          <p className="text-sm text-green-700 dark:text-green-400">RCV Total</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            ${totalRCV.toLocaleString()}
          </p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 text-center">
          <p className="text-sm text-blue-700 dark:text-blue-400">ACV Total</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
            ${totalACV.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Room breakdown */}
      {Object.keys(roomCounts).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">By Room</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(roomCounts).map(([room, count]) => (
              <Badge key={room} variant="secondary">
                {room}: {count} items
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {Object.keys(categoryTotals).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">By Category</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(categoryTotals)
              .sort((a, b) => b[1].rcv - a[1].rcv)
              .map(([cat, data]) => (
                <div key={cat} className="flex items-center justify-between border rounded-lg p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{cat}</Badge>
                    <span className="text-muted-foreground">{data.count} items</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-green-700 dark:text-green-400 font-medium">
                      RCV ${data.rcv.toLocaleString()}
                    </span>
                    <span className="text-blue-700 dark:text-blue-400">
                      ACV ${data.acv.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Export */}
      {items.length > 0 && (
        <div className="pt-2">
          <Button variant="outline" onClick={exportInventory}>
            <Copy className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      )}
    </div>
  );
};
