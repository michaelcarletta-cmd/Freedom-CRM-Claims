import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, Printer, Mail, Send } from "lucide-react";
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

interface BankAccount {
  id: string;
  name: string;
  account_number_last4?: string;
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
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
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

  useEffect(() => {
    if (open) {
      fetchBankAccounts();
      // Parse address if provided
      if (recipientAddress) {
        parseAddress(recipientAddress);
      }
    }
  }, [open, recipientAddress]);

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
    // Simple address parser - can be enhanced
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 1) {
      setFormData(prev => ({ ...prev, address1: parts[0] }));
    }
    if (parts.length >= 2) {
      // Try to parse city, state zip from second part
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

  const fetchBankAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('online-check-writer', {
        body: { action: 'get-bank-accounts' },
      });

      if (error) throw error;
      setBankAccounts(data.accounts || []);
      if (data.accounts?.length > 0) {
        setFormData(prev => ({ ...prev, bankAccountId: data.accounts[0].id }));
      }
    } catch (err) {
      console.error('Failed to fetch bank accounts:', err);
      // Don't show error on initial load - API might just need configuration
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!formData.bankAccountId) {
      toast.error('Please select a bank account');
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
    try {
      // First, search for or create the payee
      let payeeId: string | null = null;

      const { data: searchData } = await supabase.functions.invoke('online-check-writer', {
        body: {
          action: 'search-payee',
          payeeData: { name: recipientName },
        },
      });

      if (searchData?.payees?.length > 0) {
        payeeId = searchData.payees[0].id;
      } else {
        // Create payee
        const { data: createData, error: createError } = await supabase.functions.invoke('online-check-writer', {
          body: {
            action: 'create-payee',
            payeeData: {
              name: recipientName,
              email: formData.email,
              address: formData.address1,
              city: formData.city,
              state: formData.state,
              zip: formData.zip,
            },
          },
        });

        if (createError) throw createError;
        payeeId = createData.payee?.id;
      }

      // Create the check
      const { data: checkData, error: checkError } = await supabase.functions.invoke('online-check-writer', {
        body: {
          action: 'create-check',
          checkData: {
            bankAccountId: formData.bankAccountId,
            payeeId,
            payeeName: recipientName,
            amount: parseFloat(formData.amount),
            memo: formData.memo,
          },
        },
      });

      if (checkError) throw checkError;
      const checkId = checkData.check?.id;

      // Handle delivery method
      if (deliveryMethod === 'print') {
        const { data: printData, error: printError } = await supabase.functions.invoke('online-check-writer', {
          body: {
            action: 'print-check',
            checkData: { checkId },
          },
        });

        if (printError) throw printError;
        
        if (printData.printUrl) {
          window.open(printData.printUrl, '_blank');
          toast.success('Check ready for printing - opening PDF...');
        } else {
          toast.success('Check created - ready for printing in Online Check Writer');
        }
      } else if (deliveryMethod === 'mail') {
        const { error: mailError } = await supabase.functions.invoke('online-check-writer', {
          body: {
            action: 'mail-check',
            checkData: {
              checkId,
              shippingMethod: formData.shippingMethod,
              recipientName,
              address1: formData.address1,
              address2: formData.address2,
              city: formData.city,
              state: formData.state,
              zip: formData.zip,
            },
          },
        });

        if (mailError) throw mailError;
        toast.success('Check queued for mailing');
      } else if (deliveryMethod === 'email') {
        const { error: emailError } = await supabase.functions.invoke('online-check-writer', {
          body: {
            action: 'email-check',
            checkData: {
              checkId,
              email: formData.email,
              message: formData.emailMessage,
            },
          },
        });

        if (emailError) throw emailError;
        toast.success('eCheck sent via email');
      }

      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        amount: "",
        bankAccountId: bankAccounts[0]?.id || "",
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
            <Label>Bank Account *</Label>
            {loadingAccounts ? (
              <div className="flex items-center gap-2 p-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading accounts...</span>
              </div>
            ) : bankAccounts.length === 0 ? (
              <div className="flex items-center gap-2 p-2 text-yellow-500">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">No bank accounts found. Configure in Online Check Writer.</span>
              </div>
            ) : (
              <Select
                value={formData.bankAccountId}
                onValueChange={(value) => setFormData({ ...formData, bankAccountId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} {account.account_number_last4 && `(****${account.account_number_last4})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
                  A printable PDF will be generated. Print on blank check stock paper.
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
            <Button onClick={handleSubmit} disabled={isLoading || bankAccounts.length === 0} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {deliveryMethod === 'print' && 'Create & Print'}
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
