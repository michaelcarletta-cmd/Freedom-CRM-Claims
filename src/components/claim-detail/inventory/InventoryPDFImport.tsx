import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { FileUp, Loader2, Check, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ExtractedItem {
  item_name: string;
  room_name: string;
  quantity: number;
  manufacturer: string | null;
  model_number: string | null;
  original_purchase_price: number | null;
  replacement_cost: number | null;
  actual_cash_value: number | null;
  condition_before_loss: string | null;
  category: string | null;
  age_years: number | null;
  depreciation_rate: number | null;
  notes: string | null;
  // local state
  selected?: boolean;
}

interface InventoryPDFImportProps {
  claimId: string;
  onItemsAdded: () => void;
}

const COMMON_ROOMS = [
  "Living Room", "Kitchen", "Master Bedroom", "Bedroom 2", "Bedroom 3",
  "Bathroom", "Master Bathroom", "Dining Room", "Garage", "Basement",
  "Attic", "Laundry Room", "Office/Den", "Patio/Deck", "Shed/Outbuilding", "Unassigned",
];

export const InventoryPDFImport = ({ claimId, onItemsAdded }: InventoryPDFImportProps) => {
  const [stage, setStage] = useState<"idle" | "uploading" | "extracting" | "results">("idle");
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a PDF or image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB for AI processing");
      return;
    }

    setFileName(file.name);
    setStage("uploading");
    setProgress(20);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setStage("extracting");
      setProgress(50);

      const { data, error } = await supabase.functions.invoke("extract-inventory-pdf", {
        body: {
          fileBase64: base64,
          mimeType: file.type,
          fileName: file.name,
        },
      });

      if (error) throw error;
      if (!data?.success || !data?.items?.length) {
        toast.error("No items could be extracted from this document");
        setStage("idle");
        return;
      }

      setProgress(100);

      const items: ExtractedItem[] = data.items.map((item: any) => {
        const rcv = item.replacement_cost ?? item.original_purchase_price ?? null;
        const opp = item.original_purchase_price ?? item.replacement_cost ?? null;
        return {
          item_name: item.item_name || "Unknown Item",
          room_name: item.room_name || "Unassigned",
          quantity: item.quantity || 1,
          manufacturer: item.manufacturer || null,
          model_number: item.model_number || null,
          original_purchase_price: opp,
          replacement_cost: rcv,
          actual_cash_value: item.actual_cash_value ?? null,
          condition_before_loss: item.condition_before_loss || null,
          category: item.category || null,
          age_years: item.age_years ?? null,
          depreciation_rate: item.depreciation_rate ?? null,
          notes: item.notes || null,
          selected: true,
        };
      });

      setExtractedItems(items);
      setStage("results");
      toast.success(`Extracted ${items.length} items from ${file.name}`);
    } catch (err: any) {
      console.error("PDF extraction error:", err);
      toast.error("Failed to extract: " + (err.message || "Unknown error"));
      setStage("idle");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleItem = (idx: number) => {
    setExtractedItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item))
    );
  };

  const selectAll = () => setExtractedItems((prev) => prev.map((i) => ({ ...i, selected: true })));
  const deselectAll = () => setExtractedItems((prev) => prev.map((i) => ({ ...i, selected: false })));

  const updateRoom = (idx: number, room: string) => {
    setExtractedItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, room_name: room } : item))
    );
  };

  const updateField = (idx: number, field: keyof ExtractedItem, value: any) => {
    setExtractedItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const addToInventory = async () => {
    const selected = extractedItems.filter((i) => i.selected);
    if (!selected.length) {
      toast.error("No items selected");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    const inserts = selected.map((item) => ({
      claim_id: claimId,
      room_name: item.room_name,
      item_name: item.item_name,
      quantity: item.quantity,
      manufacturer: item.manufacturer,
      model_number: item.model_number,
      original_purchase_price: item.original_purchase_price,
      replacement_cost: item.replacement_cost,
      actual_cash_value: item.actual_cash_value,
      condition_before_loss: item.condition_before_loss,
      category: item.category,
      age_years: item.age_years,
      depreciation_rate: item.depreciation_rate,
      notes: item.notes,
      is_total_loss: true,
      source: "pdf_import",
      ai_confidence: 0.8,
      brand_confirmed: false,
      model_confirmed: false,
      price_confirmed: !!item.replacement_cost,
      needs_review: true,
      created_by: userData.user?.id,
    }));

    const { error } = await supabase.from("claim_home_inventory").insert(inserts as any);

    if (error) {
      toast.error("Failed to add items");
      console.error(error);
    } else {
      toast.success(`Added ${selected.length} items to inventory`);
      setExtractedItems([]);
      setStage("idle");
      onItemsAdded();
    }
  };

  const selectedCount = extractedItems.filter((i) => i.selected).length;

  // IDLE
  if (stage === "idle") {
    return (
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:bg-muted/50 transition-colors space-y-3"
        >
          <FileUp className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium text-sm">Upload a Contents PDF or Image</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload a carrier contents sheet, personal property list, or any document with itemized contents.
              AI will extract every item into your inventory.
            </p>
          </div>
          <Button variant="outline" size="sm">
            <FileUp className="h-4 w-4 mr-1" /> Choose File
          </Button>
        </div>
      </div>
    );
  }

  // PROCESSING
  if (stage === "uploading" || stage === "extracting") {
    return (
      <div className="flex flex-col items-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="font-medium">
          {stage === "uploading" ? "Uploading document..." : "Extracting items with AI..."}
        </p>
        <Progress value={progress} className="w-64" />
        <p className="text-xs text-muted-foreground">{fileName}</p>
      </div>
    );
  }

  // RESULTS
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">
            {extractedItems.length} items extracted from {fileName}
          </span>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={selectAll}>Select All</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={deselectAll}>Clear</Button>
          <Button size="sm" className="text-xs h-7" onClick={addToInventory} disabled={!selectedCount}>
            <Check className="h-3 w-3 mr-1" /> Add {selectedCount} Items
          </Button>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[60vh] border rounded-lg">
        <div className="space-y-1 p-2">
          {extractedItems.map((item, idx) => (
            <div
              key={idx}
              className={`border rounded-lg p-3 flex items-start gap-3 ${
                item.selected ? "ring-1 ring-primary bg-primary/5" : "border-border"
              }`}
            >
              <Checkbox
                checked={item.selected}
                onCheckedChange={() => toggleItem(idx)}
                className="mt-1"
              />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-sm">
                <div>
                  <Input
                    value={item.item_name}
                    onChange={(e) => updateField(idx, "item_name", e.target.value)}
                    className="h-7 text-xs font-medium"
                  />
                  <Input
                    value={item.manufacturer || ""}
                    onChange={(e) => updateField(idx, "manufacturer", e.target.value || null)}
                    placeholder="Manufacturer"
                    className="h-6 text-xs mt-1"
                  />
                </div>
                <div>
                  <Select value={item.room_name} onValueChange={(v) => updateRoom(idx, v)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_ROOMS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Qty:</span>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateField(idx, "quantity", parseInt(e.target.value) || 1)}
                    className="h-7 text-xs w-14"
                    min={1}
                  />
                  {item.category && <Badge variant="secondary" className="text-xs">{item.category}</Badge>}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-8">RCV:</span>
                    <Input
                      type="number"
                      value={item.replacement_cost ?? ""}
                      onChange={(e) => updateField(idx, "replacement_cost", e.target.value ? parseFloat(e.target.value) : null)}
                      className="h-6 text-xs"
                      step="0.01"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-8">ACV:</span>
                    <Input
                      type="number"
                      value={item.actual_cash_value ?? ""}
                      onChange={(e) => updateField(idx, "actual_cash_value", e.target.value ? parseFloat(e.target.value) : null)}
                      className="h-6 text-xs"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Input
                    value={item.condition_before_loss || ""}
                    onChange={(e) => updateField(idx, "condition_before_loss", e.target.value || null)}
                    placeholder="Condition"
                    className="h-6 text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Age:</span>
                    <Input
                      type="number"
                      value={item.age_years ?? ""}
                      onChange={(e) => updateField(idx, "age_years", e.target.value ? parseInt(e.target.value) : null)}
                      className="h-6 text-xs w-14"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => { setStage("idle"); setExtractedItems([]); }}>
          Upload Another
        </Button>
      </div>
    </div>
  );
};
