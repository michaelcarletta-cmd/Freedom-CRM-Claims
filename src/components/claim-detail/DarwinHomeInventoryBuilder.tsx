import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Package, Plus, Copy, DollarSign, Trash2 } from "lucide-react";
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
  damage_description: string | null;
  manufacturer: string | null;
  model_number: string | null;
  is_total_loss: boolean;
  notes: string | null;
}

interface DarwinHomeInventoryBuilderProps {
  claimId: string;
  claim: any;
}

const COMMON_ROOMS = [
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Bedroom 2",
  "Bedroom 3",
  "Bathroom",
  "Master Bathroom",
  "Dining Room",
  "Garage",
  "Basement",
  "Attic",
  "Laundry Room",
  "Office/Den",
  "Patio/Deck",
  "Shed/Outbuilding",
];

const CONDITIONS = [
  { value: "new", label: "New/Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

export const DarwinHomeInventoryBuilder = ({ claimId, claim }: DarwinHomeInventoryBuilderProps) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    room_name: "",
    item_name: "",
    item_description: "",
    quantity: "1",
    original_purchase_price: "",
    replacement_cost: "",
    condition_before_loss: "good",
    damage_description: "",
    manufacturer: "",
    model_number: "",
    is_total_loss: true,
    notes: "",
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("claim_home_inventory")
      .select("*")
      .eq("claim_id", claimId)
      .order("room_name", { ascending: true });

    if (error) {
      console.error("Error fetching inventory:", error);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [claimId]);

  const handleAddItem = async () => {
    if (!formData.room_name || !formData.item_name) {
      toast.error("Please fill in room and item name");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("claim_home_inventory").insert({
      claim_id: claimId,
      room_name: formData.room_name,
      item_name: formData.item_name,
      item_description: formData.item_description || null,
      quantity: parseInt(formData.quantity) || 1,
      original_purchase_price: formData.original_purchase_price ? parseFloat(formData.original_purchase_price) : null,
      replacement_cost: formData.replacement_cost ? parseFloat(formData.replacement_cost) : null,
      condition_before_loss: formData.condition_before_loss,
      damage_description: formData.damage_description || null,
      manufacturer: formData.manufacturer || null,
      model_number: formData.model_number || null,
      is_total_loss: formData.is_total_loss,
      notes: formData.notes || null,
      created_by: userData.user?.id,
    });

    if (error) {
      toast.error("Failed to add item");
      console.error(error);
    } else {
      toast.success("Item added to inventory");
      setFormData({
        room_name: formData.room_name, // Keep room selected
        item_name: "",
        item_description: "",
        quantity: "1",
        original_purchase_price: "",
        replacement_cost: "",
        condition_before_loss: "good",
        damage_description: "",
        manufacturer: "",
        model_number: "",
        is_total_loss: true,
        notes: "",
      });
      fetchItems();
    }
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("claim_home_inventory").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Item removed");
      fetchItems();
    }
  };

  const exportInventory = () => {
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.room_name]) acc[item.room_name] = [];
      acc[item.room_name].push(item);
      return acc;
    }, {} as Record<string, InventoryItem[]>);

    let csv = "Room,Item Name,Description,Qty,Original Price,Replacement Cost,Condition,Manufacturer,Model\n";
    
    items.forEach(item => {
      csv += `"${item.room_name}","${item.item_name}","${item.item_description || ""}",${item.quantity},${item.original_purchase_price || ""},${item.replacement_cost || ""},"${item.condition_before_loss || ""}","${item.manufacturer || ""}","${item.model_number || ""}"\n`;
    });

    navigator.clipboard.writeText(csv);
    toast.success("Inventory copied as CSV");
  };

  // Calculate totals
  const totalRCV = items.reduce((sum, i) => sum + (i.replacement_cost || 0) * i.quantity, 0);
  const totalOriginal = items.reduce((sum, i) => sum + (i.original_purchase_price || 0) * i.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  // Group by room
  const roomCounts = items.reduce((acc, item) => {
    acc[item.room_name] = (acc[item.room_name] || 0) + item.quantity;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-600" />
              Home Inventory Builder
            </CardTitle>
            <CardDescription>
              Document personal property for PA/NJ contents claims
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {items.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportInventory}>
                <Copy className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Inventory Item</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh]">
                  <div className="space-y-4 pr-4">
                    <div className="space-y-2">
                      <Label>Room *</Label>
                      <Select
                        value={formData.room_name}
                        onValueChange={(v) => setFormData({ ...formData, room_name: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMON_ROOMS.map((room) => (
                            <SelectItem key={room} value={room}>
                              {room}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Item Name *</Label>
                      <Input
                        placeholder='e.g., Samsung 55" Smart TV'
                        value={formData.item_name}
                        onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Manufacturer</Label>
                        <Input
                          placeholder="Samsung"
                          value={formData.manufacturer}
                          onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Model #</Label>
                        <Input
                          placeholder="UN55TU7000"
                          value={formData.model_number}
                          onChange={(e) => setFormData({ ...formData, model_number: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={formData.quantity}
                          onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Original Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.original_purchase_price}
                          onChange={(e) => setFormData({ ...formData, original_purchase_price: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Replacement Cost</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.replacement_cost}
                          onChange={(e) => setFormData({ ...formData, replacement_cost: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Condition Before Loss</Label>
                      <Select
                        value={formData.condition_before_loss}
                        onValueChange={(v) => setFormData({ ...formData, condition_before_loss: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITIONS.map((cond) => (
                            <SelectItem key={cond.value} value={cond.value}>
                              {cond.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Damage Description</Label>
                      <Textarea
                        placeholder="Describe the damage..."
                        value={formData.damage_description}
                        onChange={(e) => setFormData({ ...formData, damage_description: e.target.value })}
                      />
                    </div>

                    <Button onClick={handleAddItem} className="w-full">
                      Add to Inventory
                    </Button>
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold">{totalItems}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">Original Value</p>
            <p className="text-2xl font-bold">${totalOriginal.toLocaleString()}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 text-center">
            <p className="text-sm text-green-700 dark:text-green-400">Replacement Cost</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">${totalRCV.toLocaleString()}</p>
          </div>
        </div>

        {/* Room breakdown */}
        {Object.keys(roomCounts).length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(roomCounts).map(([room, count]) => (
                <Badge key={room} variant="secondary">
                  {room}: {count} items
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Items Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No inventory items yet</p>
            <p className="text-sm">Add items room by room for your contents claim</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead className="text-right">RCV</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.room_name}</TableCell>
                    <TableCell>
                      <div>
                        <p>{item.item_name}</p>
                        {item.manufacturer && (
                          <p className="text-xs text-muted-foreground">
                            {item.manufacturer} {item.model_number}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {item.replacement_cost ? `$${(item.replacement_cost * item.quantity).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CONDITIONS.find(c => c.value === item.condition_before_loss)?.label || item.condition_before_loss}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
