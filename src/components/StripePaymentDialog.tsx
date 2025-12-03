import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CreditCard, ExternalLink, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StripePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  recipientEmail?: string;
  recipientType: 'contractor' | 'client' | 'referrer';
  stripeAccountId?: string;
  defaultAmount?: number;
  onSuccess?: () => void;
  onAccountCreated?: (accountId: string) => void;
}

export function StripePaymentDialog({
  open,
  onOpenChange,
  recipientName,
  recipientEmail,
  recipientType,
  stripeAccountId,
  defaultAmount,
  onSuccess,
  onAccountCreated,
}: StripePaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [accountStatus, setAccountStatus] = useState<{
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [formData, setFormData] = useState({
    amount: defaultAmount?.toString() || "",
    description: "",
  });
  const [balance, setBalance] = useState<{ available: number; pending: number } | null>(null);

  useEffect(() => {
    if (open) {
      fetchBalance();
      if (stripeAccountId) {
        checkAccountStatus();
      }
    }
  }, [open, stripeAccountId]);

  useEffect(() => {
    if (defaultAmount) {
      setFormData(prev => ({ ...prev, amount: defaultAmount.toString() }));
    }
  }, [defaultAmount]);

  const fetchBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-payout', {
        body: { action: 'get-balance' },
      });
      if (!error && data.success) {
        setBalance({ available: data.available, pending: data.pending });
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

  const checkAccountStatus = async () => {
    if (!stripeAccountId) return;
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-payout', {
        body: { action: 'get-account-status', accountId: stripeAccountId },
      });
      if (!error && data.success) {
        setAccountStatus({
          payoutsEnabled: data.payoutsEnabled,
          detailsSubmitted: data.detailsSubmitted,
        });
      }
    } catch (err) {
      console.error('Failed to check account status:', err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!recipientEmail) {
      toast.error('Recipient email is required to create a Stripe account');
      return;
    }

    setIsLoading(true);
    try {
      // Create connected account
      const { data: accountData, error: accountError } = await supabase.functions.invoke('stripe-connect-payout', {
        body: {
          action: 'create-connected-account',
          email: recipientEmail,
          name: recipientName,
          type: recipientType,
        },
      });

      if (accountError) throw accountError;
      const accountId = accountData.accountId;

      // Create onboarding link
      const { data: linkData, error: linkError } = await supabase.functions.invoke('stripe-connect-payout', {
        body: {
          action: 'create-account-link',
          accountId: accountId,
          returnUrl: window.location.href,
        },
      });

      if (linkError) throw linkError;

      // Save the account ID
      onAccountCreated?.(accountId);
      
      toast.success('Stripe account created! Opening onboarding...', {
        description: 'Share the onboarding link with the recipient to complete setup.',
      });

      // Open onboarding in new tab
      window.open(linkData.url, '_blank');
      
    } catch (err: any) {
      console.error('Create account error:', err);
      toast.error(err.message || 'Failed to create Stripe account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOnboardingLink = async () => {
    if (!stripeAccountId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-payout', {
        body: {
          action: 'create-account-link',
          accountId: stripeAccountId,
          returnUrl: window.location.href,
        },
      });

      if (error) throw error;

      // Copy link to clipboard
      await navigator.clipboard.writeText(data.url);
      toast.success('Onboarding link copied to clipboard!', {
        description: 'Share this link with the recipient to complete their bank setup.',
      });

      window.open(data.url, '_blank');
    } catch (err: any) {
      console.error('Onboarding link error:', err);
      toast.error(err.message || 'Failed to generate onboarding link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!stripeAccountId) {
      toast.error('No Stripe account connected');
      return;
    }

    if (!accountStatus?.payoutsEnabled) {
      toast.error('Recipient has not completed bank setup');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (balance && amount > balance.available) {
      toast.error('Insufficient Stripe balance');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-payout', {
        body: {
          action: 'create-transfer',
          accountId: stripeAccountId,
          amount: amount,
          description: formData.description || `Payment to ${recipientName}`,
        },
      });

      if (error) throw error;

      toast.success(`$${amount.toFixed(2)} sent to ${recipientName}!`);
      onOpenChange(false);
      onSuccess?.();
      
      setFormData({ amount: "", description: "" });
    } catch (err: any) {
      console.error('Payment error:', err);
      toast.error(err.message || 'Failed to send payment');
    } finally {
      setIsLoading(false);
    }
  };

  // No Stripe account yet
  if (!stripeAccountId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Up Direct Payment</DialogTitle>
            <DialogDescription>
              Create a Stripe account for {recipientName} to send payments directly to their bank.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <span className="font-medium">How it works:</span>
              </div>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-7">
                <li>Create a Stripe Connect account for the recipient</li>
                <li>They complete onboarding to link their bank account</li>
                <li>You can then send payments directly from your CRM</li>
              </ol>
            </div>

            {!recipientEmail && (
              <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Email address required. Please add an email for this {recipientType}.</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleCreateAccount} 
                disabled={isLoading || !recipientEmail}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Stripe Account
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Has account but not fully set up
  if (stripeAccountId && checkingStatus) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (stripeAccountId && !accountStatus?.payoutsEnabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Bank Setup</DialogTitle>
            <DialogDescription>
              {recipientName} needs to complete their bank account setup before you can send payments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                Pending Setup
              </Badge>
              <span className="text-sm text-muted-foreground">
                Bank account not yet connected
              </span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSendOnboardingLink} disabled={isLoading} className="flex-1">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Send Setup Link
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Ready to pay
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Payment via Stripe</DialogTitle>
          <DialogDescription>
            Direct ACH transfer to {recipientName}'s bank account
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600">Bank account connected</span>
          </div>

          {balance && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">Available balance: </span>
              <span className="font-medium">${balance.available.toFixed(2)}</span>
              {balance.pending > 0 && (
                <span className="text-muted-foreground ml-2">(${balance.pending.toFixed(2)} pending)</span>
              )}
            </div>
          )}

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
            <Label>Description</Label>
            <Textarea
              placeholder="Payment description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmitPayment} disabled={isLoading} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                `Send $${formData.amount || '0.00'}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
