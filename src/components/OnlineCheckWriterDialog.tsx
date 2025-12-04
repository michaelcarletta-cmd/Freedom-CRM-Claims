import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Printer, Mail, Send, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface OnlineCheckWriterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  recipientEmail?: string;
  recipientAddress?: string;
  defaultAmount?: number;
  onSuccess?: () => void;
}

export function OnlineCheckWriterDialog({
  open,
  onOpenChange,
  recipientName,
  recipientEmail,
  recipientAddress,
  defaultAmount,
  onSuccess,
}: OnlineCheckWriterDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'print' | 'mail' | 'email'>('print');
  const [formData, setFormData] = useState({
    amount: defaultAmount?.toString() || "",
    bankAccountId: "",
    memo: "",
    // Mail-specific fields
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    shippingMethod: "usps_first_class",
    // Email-specific fields
    email: recipientEmail || "",
    emailMessage: "Please find your check attached.",
  });

  // Load saved bank account ID from company branding
  useEffect(() => {
    if (open) {
      loadSavedBankAccountId();
      if (recipientAddress) {
        parseAddress(recipientAddress);
      }
    }
  }, [open, recipientAddress]);

  const loadSavedBankAccountId = async () => {
    try {
      const { data } = await supabase
        .from('company_branding')
        .select('online_check_writer_bank_account_id')
        .limit(1)
        .single();
      
      if (data?.online_check_writer_bank_account_id) {
        setFormData(prev => ({ ...prev, bankAccountId: data.online_check_writer_bank_account_id }));
      }
    } catch (err) {
      // No saved bank account ID, that's fine
    }
  };

  const saveBankAccountId = async (bankAccountId: string) => {
    try {
      const { data: existing } = await supabase
        .from('company_branding')
        .select('id')
        .limit(1)
        .single();
      
      if (existing) {
        await supabase
          .from('company_branding')
          .update({ online_check_writer_bank_account_id: bankAccountId })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('company_branding')
          .insert({ online_check_writer_bank_account_id: bankAccountId });
      }
    } catch (err) {
      console.error('Failed to save bank account ID:', err);
    }
  };

  useEffect(() => {
    if (defaultAmount) {
      setFormData(prev => ({ ...prev, amount: defaultAmount.toString() }));
    }
  }, [defaultAmount]);

  useEffect(() => {
    if (recipientEmail) {
      setFormData(prev => ({ ...prev, email: recipientEmail }));
    }
  }, [recipientEmail]);

  const parseAddress = (address: string) => {
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 1) {
      setFormData(prev => ({ ...prev, address1: parts[0] }));
    }
    if (parts.length >= 2) {
      const cityStateZip = parts[1];
      const match = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
      if (match) {
        setFormData(prev => ({
          ...prev,
          city: match[1],
          state: match[2].toUpperCase(),
          zip: match[3],
        }));
      } else {
        setFormData(prev => ({ ...prev, city: cityStateZip }));
      }
    }
  };

  const handleSubmit = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!formData.bankAccountId.trim()) {
      toast.error('Please enter your bank account ID from Online Check Writer');
      return;
    }

    if (deliveryMethod === 'mail') {
      if (!formData.address1 || !formData.city || !formData.state || !formData.zip) {
        toast.error('Please fill in all address fields for mailing');
        return;
      }
    }

    if (deliveryMethod === 'email' && !formData.email) {
      toast.error('Please enter an email address');
      return;
    }

    setIsLoading(true);
    
    // Save bank account ID for future use
    await saveBankAccountId(formData.bankAccountId.trim());
    
    try {
      let action = 'create-check';
      if (deliveryMethod === 'mail') action = 'mail-check';
      if (deliveryMethod === 'email') action = 'email-check';
      if (deliveryMethod === 'print') action = 'print-check';

      const checkData = {
        bankAccountId: formData.bankAccountId.trim(),
        payeeName: recipientName,
        amount: parseFloat(formData.amount),
        memo: formData.memo,
        date: new Date().toISOString().split('T')[0],
        // Address fields for mail
        address1: formData.address1,
        address2: formData.address2,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        shippingMethod: formData.shippingMethod,
        // Email fields
        email: formData.email,
        message: formData.emailMessage,
      };

      const { data, error } = await supabase.functions.invoke('online-check-writer', {
        body: { action, checkData },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (deliveryMethod === 'print') {
        toast.success(`Check #${data.checkId || 'created'} - ready for printing in Online Check Writer`);
      } else if (deliveryMethod === 'mail') {
        toast.success('Check created and queued for mailing');
      } else if (deliveryMethod === 'email') {
        if (data.partial) {
          // Check created but email delivery failed
          toast.warning(data.message || `Check created (ID: ${data.checkId}) - please send manually from Online Check Writer dashboard`);
        } else {
          toast.success('eCheck sent via email');
        }
      }

      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        amount: "",
        bankAccountId: formData.bankAccountId, // Keep bank account ID
        memo: "",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip: "",
        shippingMethod: "usps_first_class",
        email: recipientEmail || "",
        emailMessage: "Please find your check attached.",
      });
    } catch (err: any) {
      console.error('Check error:', err);
      toast.error(err.message || 'Failed to process check');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Online Check Writer</DialogTitle>
          <DialogDescription>
            Create and send checks via Online Check Writer
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Recipient</Label>
            <Input value={recipientName} disabled className="bg-muted" />
          </div>

          <div>
            <Label>Amount *</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            />
          </div>

          <div>
            <Label>Bank Account ID *</Label>
            <Input
              placeholder="Enter your bank account ID"
              value={formData.bankAccountId}
              onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              Will be saved for future use. Find your ID in{" "}
              <a 
                href="https://live.onlinecheckwriter.com/manage/developer/index" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Online Check Writer
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <div>
            <Label>Memo</Label>
            <Input
              placeholder="Check memo (optional)"
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
            />
          </div>

          <div>
            <Label>Delivery Method</Label>
            <Tabs value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as any)}>
              <TabsList className="w-full">
                <TabsTrigger value="print" className="flex-1 gap-1">
                  <Printer className="h-4 w-4" />
                  Print
                </TabsTrigger>
                <TabsTrigger value="mail" className="flex-1 gap-1">
                  <Send className="h-4 w-4" />
                  Mail
                </TabsTrigger>
                <TabsTrigger value="email" className="flex-1 gap-1">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
              </TabsList>

              <TabsContent value="print" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Check will be created and ready for printing in Online Check Writer on blank check stock.
                </p>
              </TabsContent>

              <TabsContent value="mail" className="mt-4 space-y-3">
                <div>
                  <Label>Address Line 1 *</Label>
                  <Input
                    placeholder="Street address"
                    value={formData.address1}
                    onChange={(e) => setFormData({ ...formData, address1: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Address Line 2</Label>
                  <Input
                    placeholder="Apt, Suite, etc."
                    value={formData.address2}
                    onChange={(e) => setFormData({ ...formData, address2: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>City *</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>State *</Label>
                    <Input
                      maxLength={2}
                      placeholder="NJ"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <Label>ZIP *</Label>
                    <Input
                      value={formData.zip}
                      onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Shipping Method</Label>
                  <Select
                    value={formData.shippingMethod}
                    onValueChange={(value) => setFormData({ ...formData, shippingMethod: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usps_first_class">USPS First Class</SelectItem>
                      <SelectItem value="usps_priority">USPS Priority</SelectItem>
                      <SelectItem value="fedex_overnight">FedEx Overnight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="email" className="mt-4 space-y-3">
                <div>
                  <Label>Email Address *</Label>
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea
                    placeholder="Optional message to include with the eCheck"
                    value={formData.emailMessage}
                    onChange={(e) => setFormData({ ...formData, emailMessage: e.target.value })}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {deliveryMethod === 'print' && 'Create Check'}
                  {deliveryMethod === 'mail' && 'Create & Mail'}
                  {deliveryMethod === 'email' && 'Create & Email'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
