import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, FileText, Receipt, Building2, TrendingUp, ExternalLink, Copy, FileOutput } from "lucide-react";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ClaimPayments } from "./ClaimPayments";
import { InvoiceDialog } from "@/components/InvoiceDialog";

interface ClaimAccountingProps {
  claim: any;
  userRole: string | null;
}

export function ClaimAccounting({ claim, userRole }: ClaimAccountingProps) {
  const isAdmin = userRole === 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Fetch settlement data
  const { data: settlement } = useQuery({
    queryKey: ["claim-settlement", claim.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_settlements")
        .select("*")
        .eq("claim_id", claim.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch checks
  const { data: checks } = useQuery({
    queryKey: ["claim-checks", claim.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_checks")
        .select("*")
        .eq("claim_id", claim.id)
        .order("check_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch expenses
  const { data: expenses } = useQuery({
    queryKey: ["claim-expenses", claim.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_expenses")
        .select("*")
        .eq("claim_id", claim.id)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch fees
  const { data: fees } = useQuery({
    queryKey: ["claim-fees", claim.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_fees")
        .select("*")
        .eq("claim_id", claim.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Calculate totals
  const totalChecksReceived = checks?.reduce((sum, check) => sum + Number(check.amount), 0) || 0;
  const totalExpenses = expenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;
  const settlementAmount = settlement?.total_settlement || 0;
  const grossProfit = totalChecksReceived - totalExpenses;
  const companyFee = fees?.company_fee_amount || 0;
  const adjusterFee = fees?.adjuster_fee_amount || 0;
  const netProfit = grossProfit - companyFee - adjusterFee;

  return (
    <div className="space-y-6">
      {/* Invoice Button */}
      <div className="flex justify-end">
        <Button onClick={() => setInvoiceOpen(true)} variant="outline">
          <FileOutput className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Settlement Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${settlementAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Checks Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">${totalChecksReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Net Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Settlement Details */}
      <SettlementSection claimId={claim.id} settlement={settlement} isAdmin={isAdmin} />

      {/* Insurance Checks */}
      <ChecksSection claimId={claim.id} checks={checks || []} isAdmin={isAdmin} claim={claim} />

      {/* Expenses */}
      <ExpensesSection claimId={claim.id} expenses={expenses || []} isAdmin={isAdmin} />

      {/* Fees & Profit Breakdown */}
      <FeesSection 
        claimId={claim.id} 
        fees={fees} 
        grossProfit={grossProfit}
        totalChecksReceived={totalChecksReceived}
        checks={checks || []}
        isAdmin={isAdmin}
      />

      {/* Payments Released */}
      <ClaimPayments claimId={claim.id} isAdmin={isAdmin} />

      {/* Invoice Dialog */}
      <InvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        claimId={claim.id}
        claimNumber={claim.claim_number}
        defaultRecipient={{
          name: claim.policyholder_name || "",
          email: claim.policyholder_email || "",
          address: claim.policyholder_address || "",
        }}
      />
    </div>
  );
}

// Settlement Section Component
function SettlementSection({ claimId, settlement, isAdmin }: any) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    replacement_cost_value: settlement?.replacement_cost_value || 0,
    non_recoverable_depreciation: settlement?.non_recoverable_depreciation || 0,
    recoverable_depreciation: settlement?.recoverable_depreciation || 0,
    deductible: settlement?.deductible || 0,
    estimate_amount: settlement?.estimate_amount || 0,
    notes: settlement?.notes || "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (settlement) {
        const { error } = await supabase
          .from("claim_settlements")
          .update(formData)
          .eq("id", settlement.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("claim_settlements")
          .insert({
            ...formData,
            claim_id: claimId,
            created_by: user?.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-settlement", claimId] });
      setOpen(false);
      toast({ title: "Settlement saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settlement", variant: "destructive" });
    },
  });

  const actualCashValue = 
    Number(formData.replacement_cost_value) - 
    Number(formData.recoverable_depreciation) -
    Number(formData.non_recoverable_depreciation) - 
    Number(formData.deductible);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Settlement Details
          </CardTitle>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                if (settlement) {
                  setFormData({
                    replacement_cost_value: settlement.replacement_cost_value,
                    non_recoverable_depreciation: settlement.non_recoverable_depreciation,
                    recoverable_depreciation: settlement.recoverable_depreciation,
                    deductible: settlement.deductible,
                    estimate_amount: settlement.estimate_amount,
                    notes: settlement.notes || "",
                  });
                }
              }}>
                <Plus className="h-4 w-4 mr-2" />
                {settlement ? "Edit" : "Add"} Settlement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{settlement ? "Edit" : "Add"} Settlement</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Replacement Cost Value (RCV)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.replacement_cost_value}
                      onChange={(e) => setFormData({ ...formData, replacement_cost_value: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Estimate Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.estimate_amount}
                      onChange={(e) => setFormData({ ...formData, estimate_amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Non-Recoverable Depreciation</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.non_recoverable_depreciation}
                      onChange={(e) => setFormData({ ...formData, non_recoverable_depreciation: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Recoverable Depreciation</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.recoverable_depreciation}
                      onChange={(e) => setFormData({ ...formData, recoverable_depreciation: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Deductible</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.deductible}
                    onChange={(e) => setFormData({ ...formData, deductible: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Replacement Cost Value (RCV):</span>
                      <span className="font-semibold">${Number(formData.replacement_cost_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>- Recoverable Depreciation:</span>
                      <span className="font-semibold">-${Number(formData.recoverable_depreciation).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>- Non-Recoverable Depreciation:</span>
                      <span className="font-semibold">-${Number(formData.non_recoverable_depreciation).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>- Deductible:</span>
                      <span className="font-semibold">-${Number(formData.deductible).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span className="font-medium">Actual Cash Value (ACV) - Initial Payment:</span>
                      <span className="text-lg font-bold text-primary">
                        ${actualCashValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between text-success">
                      <span className="font-medium">Recoverable Depreciation (paid at completion):</span>
                      <span className="text-lg font-bold">
                        ${Number(formData.recoverable_depreciation).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 p-2 bg-background rounded">
                    <p><strong>Note:</strong> Deductible (${Number(formData.deductible).toLocaleString()}) is paid by policyholder to contractor, not included in checks to track.</p>
                  </div>
                </div>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
                  Save Settlement
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {settlement ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Replacement Cost Value (RCV)</p>
                <p className="text-lg font-semibold">${Number(settlement.replacement_cost_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estimate Amount</p>
                <p className="text-lg font-semibold">${Number(settlement.estimate_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Replacement Cost Value (RCV):</span>
                <span className="font-semibold">${Number(settlement.replacement_cost_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm text-destructive">
                <span>- Recoverable Depreciation:</span>
                <span className="font-semibold">-${Number(settlement.recoverable_depreciation).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm text-destructive">
                <span>- Non-Recoverable Depreciation:</span>
                <span className="font-semibold">-${Number(settlement.non_recoverable_depreciation).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm text-destructive">
                <span>- Deductible:</span>
                <span className="font-semibold">-${Number(settlement.deductible).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-medium">Actual Cash Value (ACV) - Initial Payment:</span>
                <span className="text-xl font-bold text-primary">
                  ${Number(settlement.total_settlement).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="p-4 bg-success/10 rounded-lg border border-success/20">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-success">Recoverable Depreciation</p>
                  <p className="text-xs text-muted-foreground">Paid when work is completed</p>
                </div>
                <p className="text-xl font-bold text-success">
                  ${Number(settlement.recoverable_depreciation).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded border">
              <p><strong>Checks to Track:</strong></p>
              <p className="mt-1">• Initial ACV Payment: ${Number(settlement.total_settlement).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p>• Recoverable Depreciation (upon completion): ${Number(settlement.recoverable_depreciation).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="mt-2 text-xs"><em>Deductible (${Number(settlement.deductible).toLocaleString()}) is paid by policyholder to contractor</em></p>
            </div>

            {settlement.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm">{settlement.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">No settlement details added yet</p>
        )}
      </CardContent>
    </Card>
  );
}

// Checks Section Component  
function ChecksSection({ claimId, checks, isAdmin, claim }: any) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    check_number: "",
    check_date: "",
    amount: 0,
    check_type: "initial",
    received_date: "",
    notes: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("claim_checks")
        .insert({
          ...formData,
          claim_id: claimId,
          created_by: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-checks", claimId] });
      setOpen(false);
      setFormData({
        check_number: "",
        check_date: "",
        amount: 0,
        check_type: "initial",
        received_date: "",
        notes: "",
      });
      toast({ title: "Check added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add check", variant: "destructive" });
    },
  });

  const handleOpenIink = () => {
    window.open('https://iink.com', '_blank', 'noopener,noreferrer');
  };

  const handleCopyClaimDetails = () => {
    const details = [
      claim?.policyholder_name && `Name: ${claim.policyholder_name}`,
      claim?.policyholder_address && `Address: ${claim.policyholder_address}`,
      claim?.claim_number && `Claim #: ${claim.claim_number}`,
      claim?.policy_number && `Policy #: ${claim.policy_number}`,
      claim?.insurance_company && `Insurance: ${claim.insurance_company}`,
    ].filter(Boolean).join('\n');
    
    navigator.clipboard.writeText(details);
    toast({ title: "Copied to clipboard", description: "Claim details ready to paste into iink" });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Insurance Checks Received</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyClaimDetails}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Details
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenIink}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open iink
            </Button>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Check
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Insurance Check</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Check Number</Label>
                    <Input
                      value={formData.check_number}
                      onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Check Type</Label>
                    <Select value={formData.check_type} onValueChange={(value) => setFormData({ ...formData, check_type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="initial">Initial Payment</SelectItem>
                        <SelectItem value="recoverable_depreciation">Recoverable Depreciation</SelectItem>
                        <SelectItem value="supplemental">Supplemental Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Check Date</Label>
                    <Input
                      type="date"
                      value={formData.check_date}
                      onChange={(e) => setFormData({ ...formData, check_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Received Date</Label>
                    <Input
                      type="date"
                      value={formData.received_date}
                      onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                </div>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
                  Add Check
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {checks.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Check Date</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((check: any) => (
                <TableRow key={check.id}>
                  <TableCell className="font-medium">{check.check_number}</TableCell>
                  <TableCell className="capitalize">{check.check_type.replace("_", " ")}</TableCell>
                  <TableCell>{format(new Date(check.check_date), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{check.received_date ? format(new Date(check.received_date), "MMM dd, yyyy") : "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-success">
                    ${Number(check.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-center py-8">No checks recorded yet</p>
        )}
      </CardContent>
    </Card>
  );
}

// Expenses Section Component
function ExpensesSection({ claimId, expenses, isAdmin }: any) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    expense_date: "",
    description: "",
    amount: 0,
    category: "other",
    paid_to: "",
    payment_method: "",
    notes: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("claim_expenses")
        .insert({
          ...formData,
          claim_id: claimId,
          created_by: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-expenses", claimId] });
      setOpen(false);
      setFormData({
        expense_date: "",
        description: "",
        amount: 0,
        category: "other",
        paid_to: "",
        payment_method: "",
        notes: "",
      });
      toast({ title: "Expense added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add expense", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Expenses</CardTitle>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={formData.expense_date}
                      onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="materials">Materials</SelectItem>
                        <SelectItem value="inspection">Inspection</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Paid To</Label>
                    <Input
                      value={formData.paid_to}
                      onChange={(e) => setFormData({ ...formData, paid_to: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Input
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    placeholder="Check, Credit Card, etc."
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                </div>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
                  Add Expense
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {expenses.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense: any) => (
                <TableRow key={expense.id}>
                  <TableCell>{format(new Date(expense.expense_date), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{expense.description}</TableCell>
                  <TableCell className="capitalize">{expense.category}</TableCell>
                  <TableCell>{expense.paid_to || "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-destructive">
                    ${Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-center py-8">No expenses recorded yet</p>
        )}
      </CardContent>
    </Card>
  );
}

// Fees Section Component
function FeesSection({ claimId, fees, grossProfit, totalChecksReceived, checks, isAdmin }: any) {
  const [open, setOpen] = useState(false);
  
  // Calculate company fee based on percentage of each check
  const calculateFeeFromChecks = (percentage: number) => {
    return checks.reduce((sum: number, check: any) => {
      return sum + (Number(check.amount) * percentage / 100);
    }, 0);
  };
  
  // Calculate adjuster fee as percentage of company fee
  const calculateAdjusterFee = (companyFeeAmount: number, adjusterPercentage: number) => {
    return companyFeeAmount * adjusterPercentage / 100;
  };
  
  const [formData, setFormData] = useState({
    company_fee_percentage: fees?.company_fee_percentage || 0,
    company_fee_amount: fees?.company_fee_amount || 0,
    adjuster_fee_percentage: fees?.adjuster_fee_percentage || 0,
    adjuster_fee_amount: fees?.adjuster_fee_amount || 0,
    contractor_fee_percentage: fees?.contractor_fee_percentage || 0,
    contractor_fee_amount: fees?.contractor_fee_amount || 0,
    referrer_fee_percentage: fees?.referrer_fee_percentage || 0,
    referrer_fee_amount: fees?.referrer_fee_amount || 0,
    notes: fees?.notes || "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (fees) {
        const { error } = await supabase
          .from("claim_fees")
          .update(formData)
          .eq("id", fees.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("claim_fees")
          .insert({
            ...formData,
            claim_id: claimId,
            created_by: user?.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-fees", claimId] });
      setOpen(false);
      toast({ title: "Fees saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save fees", variant: "destructive" });
    },
  });

  const companyFee = fees?.company_fee_amount || 0;
  const adjusterFee = fees?.adjuster_fee_amount || 0;
  const contractorFee = fees?.contractor_fee_amount || 0;
  const referrerFee = fees?.referrer_fee_amount || 0;
  const totalFees = companyFee + adjusterFee + contractorFee + referrerFee;
  const netProfit = grossProfit - totalFees;

  // Recalculate adjuster fee when company fee changes (contractor/referrer are independent)
  const handleCompanyFeeChange = (percentage: number) => {
    const companyAmount = calculateFeeFromChecks(percentage);
    const adjusterAmount = calculateAdjusterFee(companyAmount, formData.adjuster_fee_percentage);
    setFormData({ 
      ...formData, 
      company_fee_percentage: percentage,
      company_fee_amount: companyAmount,
      adjuster_fee_amount: adjusterAmount,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Fees & Profit Breakdown</CardTitle>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                if (fees) {
                  setFormData({
                    company_fee_percentage: fees.company_fee_percentage,
                    company_fee_amount: fees.company_fee_amount,
                    adjuster_fee_percentage: fees.adjuster_fee_percentage,
                    adjuster_fee_amount: fees.adjuster_fee_amount,
                    contractor_fee_percentage: fees.contractor_fee_percentage || 0,
                    contractor_fee_amount: fees.contractor_fee_amount || 0,
                    referrer_fee_percentage: fees.referrer_fee_percentage || 0,
                    referrer_fee_amount: fees.referrer_fee_amount || 0,
                    notes: fees.notes || "",
                  });
                }
              }}>
                <Plus className="h-4 w-4 mr-2" />
                {fees ? "Edit" : "Set"} Fees
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{fees ? "Edit" : "Set"} Fees</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Company Fee (% of each check)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Percentage</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.company_fee_percentage}
                        onChange={(e) => handleCompanyFeeChange(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Amount ($) - Calculated</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.company_fee_amount}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Adjuster Fee (% of company fee)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Percentage</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.adjuster_fee_percentage}
                        onChange={(e) => {
                          const percentage = parseFloat(e.target.value) || 0;
                          const amount = calculateAdjusterFee(formData.company_fee_amount, percentage);
                          setFormData({ 
                            ...formData, 
                            adjuster_fee_percentage: percentage,
                            adjuster_fee_amount: amount
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Amount ($) - Calculated</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.adjuster_fee_amount}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Contractor Fee (% of each check)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Percentage</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.contractor_fee_percentage}
                        onChange={(e) => {
                          const percentage = parseFloat(e.target.value) || 0;
                          const amount = calculateFeeFromChecks(percentage);
                          setFormData({ 
                            ...formData, 
                            contractor_fee_percentage: percentage,
                            contractor_fee_amount: amount
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Amount ($) - Calculated</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.contractor_fee_amount}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Referrer Fee (% of each check)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Percentage</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.referrer_fee_percentage}
                        onChange={(e) => {
                          const percentage = parseFloat(e.target.value) || 0;
                          const amount = calculateFeeFromChecks(percentage);
                          setFormData({ 
                            ...formData, 
                            referrer_fee_percentage: percentage,
                            referrer_fee_amount: amount
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Amount ($) - Calculated</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.referrer_fee_amount}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                </div>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
                  Save Fees
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Total Income</p>
              <p className="text-xl font-bold text-success">${totalChecksReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Gross Profit</p>
              <p className="text-xl font-bold">${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Income - Expenses</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
              <span className="text-sm">Company Fee</span>
              <span className="font-semibold">
                ${companyFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {fees?.company_fee_percentage > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">({fees.company_fee_percentage}%)</span>
                )}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
              <span className="text-sm">Adjuster Fee</span>
              <span className="font-semibold">
                ${adjusterFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {fees?.adjuster_fee_percentage > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">({fees.adjuster_fee_percentage}%)</span>
                )}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
              <span className="text-sm">Contractor Fee</span>
              <span className="font-semibold">
                ${contractorFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {fees?.contractor_fee_percentage > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">({fees.contractor_fee_percentage}%)</span>
                )}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
              <span className="text-sm">Referrer Fee</span>
              <span className="font-semibold">
                ${referrerFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {fees?.referrer_fee_percentage > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">({fees.referrer_fee_percentage}%)</span>
                )}
              </span>
            </div>
          </div>

          <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Net Profit</span>
              <span className="text-2xl font-bold text-primary">
                ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              After all fees (company, adjuster, contractor, referrer)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
