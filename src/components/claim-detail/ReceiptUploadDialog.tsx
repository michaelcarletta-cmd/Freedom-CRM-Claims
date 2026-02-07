import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Camera, FileUp, Loader2, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ExtractedLineItem {
  description: string;
  amount: number;
  category: string;
  selected: boolean;
}

interface ExtractedReceipt {
  vendor_name: string | null;
  date: string | null;
  line_items: ExtractedLineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

const EXPENSE_CATEGORIES = [
  { value: "lodging", label: "Lodging (Hotel/Rental)", icon: "🏨" },
  { value: "meals", label: "Meals & Food", icon: "🍽️" },
  { value: "storage", label: "Storage", icon: "📦" },
  { value: "transportation", label: "Transportation/Gas", icon: "🚗" },
  { value: "laundry", label: "Laundry", icon: "🧺" },
  { value: "pet_boarding", label: "Pet Boarding", icon: "🐕" },
  { value: "other", label: "Other ALE", icon: "📋" },
];

interface ReceiptUploadDialogProps {
  claimId: string;
  onExpensesAdded: () => void;
}

export const ReceiptUploadDialog = ({ claimId, onExpensesAdded }: ReceiptUploadDialogProps) => {
  const [open, setOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setExtracted(null);
    setPreviewUrl(null);
    setReceiptFile(null);
    setExtracting(false);
    setSaving(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    await extractReceipt(file);
  };

  const extractReceipt = async (file: File) => {
    setExtracting(true);
    try {
      const base64 = await fileToBase64(file);
      const { data: { session } } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke('extract-receipt', {
        body: { imageBase64: base64, mimeType: file.type },
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      if (!result.success) throw new Error(result.error || 'Extraction failed');

      const data = result.data;
      setExtracted({
        vendor_name: data.vendor_name || null,
        date: data.date || null,
        line_items: (data.line_items || []).map((item: any) => ({
          description: item.description,
          amount: Number(item.amount) || 0,
          category: item.category || "other",
          selected: true,
        })),
        subtotal: data.subtotal || null,
        tax: data.tax || null,
        total: data.total || null,
      });

      toast.success(`Extracted ${data.line_items?.length || 0} line items`);
    } catch (err: any) {
      console.error("Receipt extraction error:", err);
      toast.error("Failed to extract receipt: " + (err.message || "Unknown error"));
    } finally {
      setExtracting(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const toggleItem = (index: number) => {
    if (!extracted) return;
    const updated = { ...extracted };
    updated.line_items[index].selected = !updated.line_items[index].selected;
    setExtracted(updated);
  };

  const updateItemCategory = (index: number, category: string) => {
    if (!extracted) return;
    const updated = { ...extracted };
    updated.line_items[index].category = category;
    setExtracted(updated);
  };

  const updateItemAmount = (index: number, amount: string) => {
    if (!extracted) return;
    const updated = { ...extracted };
    updated.line_items[index].amount = parseFloat(amount) || 0;
    setExtracted(updated);
  };

  const removeItem = (index: number) => {
    if (!extracted) return;
    const updated = { ...extracted };
    updated.line_items.splice(index, 1);
    setExtracted(updated);
  };

  const selectedItems = extracted?.line_items.filter(i => i.selected) || [];
  const selectedTotal = selectedItems.reduce((sum, i) => sum + i.amount, 0);

  const handleSaveExpenses = async () => {
    if (!extracted || selectedItems.length === 0) {
      toast.error("No items selected");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const expenseDate = extracted.date || format(new Date(), "yyyy-MM-dd");

      // Upload receipt file to storage and save to claim file library
      let receiptFilePath: string | null = null;
      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${claimId}/receipts/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('claim-files')
          .upload(fileName, receiptFile);
        if (!uploadError) {
          receiptFilePath = fileName;

          // Find or create a "Receipts" folder
          let folderId: string | null = null;
          const { data: existingFolder } = await supabase
            .from('claim_folders')
            .select('id')
            .eq('claim_id', claimId)
            .eq('name', 'Receipts')
            .maybeSingle();

          if (existingFolder) {
            folderId = existingFolder.id;
          } else {
            const { data: newFolder } = await supabase
              .from('claim_folders')
              .insert({ claim_id: claimId, name: 'Receipts', created_by: userData.user?.id })
              .select('id')
              .single();
            folderId = newFolder?.id || null;
          }

          // Save file record to claim_files
          await supabase.from('claim_files').insert({
            claim_id: claimId,
            file_name: receiptFile.name,
            file_path: fileName,
            file_type: receiptFile.type,
            file_size: receiptFile.size,
            folder_id: folderId,
            uploaded_by: userData.user?.id,
            source: 'receipt_scan',
          });
        }
      }

      const inserts = selectedItems.map(item => ({
        claim_id: claimId,
        expense_category: item.category,
        expense_date: expenseDate,
        vendor_name: extracted.vendor_name || null,
        description: item.description,
        amount: item.amount,
        receipt_file_path: receiptFilePath,
        created_by: userData.user?.id,
      }));

      const { error } = await supabase.from("claim_loss_of_use_expenses").insert(inserts);

      if (error) throw error;

      toast.success(`Added ${selectedItems.length} expense(s) totaling $${selectedTotal.toFixed(2)}`);
      resetState();
      setOpen(false);
      onExpensesAdded();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Failed to save expenses");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Camera className="h-4 w-4 mr-1" /> Scan Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Upload Receipt for Auto-Extraction
          </DialogTitle>
        </DialogHeader>

        {!extracted && !extracting && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Click to upload a receipt</p>
              <p className="text-sm text-muted-foreground mt-1">
                Supports images (JPG, PNG) and PDFs
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {extracting && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing receipt with AI...</p>
            {previewUrl && (
              <img src={previewUrl} alt="Receipt preview" className="max-h-32 rounded-lg opacity-50 mt-2" />
            )}
          </div>
        )}

        {extracted && (
          <div className="space-y-4">
            {/* Receipt summary */}
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <div>
                {extracted.vendor_name && (
                  <p className="font-medium">{extracted.vendor_name}</p>
                )}
                {extracted.date && (
                  <p className="text-sm text-muted-foreground">{extracted.date}</p>
                )}
              </div>
              {extracted.total != null && (
                <Badge variant="secondary" className="text-base">
                  Total: ${extracted.total.toFixed(2)}
                </Badge>
              )}
            </div>

            {/* Line items table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right w-24">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extracted.line_items.map((item, idx) => {
                    const catInfo = EXPENSE_CATEGORIES.find(c => c.value === item.category);
                    return (
                      <TableRow key={idx} className={!item.selected ? "opacity-50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={item.selected}
                            onCheckedChange={() => toggleItem(idx)}
                          />
                        </TableCell>
                        <TableCell className="text-sm">{item.description}</TableCell>
                        <TableCell>
                          <Select
                            value={item.category}
                            onValueChange={(v) => updateItemCategory(idx, v)}
                          >
                            <SelectTrigger className="h-8 text-xs w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EXPENSE_CATEGORIES.map(cat => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.icon} {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) => updateItemAmount(idx, e.target.value)}
                            className="h-8 w-24 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {extracted.tax != null && extracted.tax > 0 && (
                    <TableRow className="bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={2} className="text-sm text-muted-foreground">Tax</TableCell>
                      <TableCell className="text-right text-sm">${extracted.tax.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Summary footer */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedItems.length} of {extracted.line_items.length} items selected
              </p>
              <p className="font-semibold">
                Selected Total: ${selectedTotal.toFixed(2)}
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { resetState(); }}>
                Upload Different Receipt
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveExpenses}
                disabled={saving || selectedItems.length === 0}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Add {selectedItems.length} Expense{selectedItems.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
