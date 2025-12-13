import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, TrendingUp, TrendingDown, Receipt, AlertCircle, CreditCard, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { QuickBooksPaymentDialog } from "@/components/QuickBooksPaymentDialog";
import { InvoiceDialog } from "@/components/InvoiceDialog";

const Sales = () => {
  const { userRole, user } = useAuth();
  const [qbPaymentOpen, setQbPaymentOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentRecipient, setPaymentRecipient] = useState<{ name: string; email?: string } | null>(null);
  const [contractorId, setContractorId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";
  const isStaff = userRole === "staff";
  const isContractor = userRole === "contractor";

  // Get contractor record ID for contractor users
  useEffect(() => {
    const fetchContractorId = async () => {
      if (isContractor && user?.id) {
        // Contractor's user_id is stored in claim_contractors.contractor_id
        setContractorId(user.id);
      }
    };
    fetchContractorId();
  }, [isContractor, user?.id]);

  // Fetch all settlements (admin only)
  const { data: settlements, isLoading: settlementsLoading } = useQuery({
    queryKey: ["settlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_settlements")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Fetch all checks received (admin only)
  const { data: checks, isLoading: checksLoading } = useQuery({
    queryKey: ["checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_checks")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Fetch all expenses (admin only)
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_expenses")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Fetch fees - different queries for admin vs staff
  const { data: fees, isLoading: feesLoading } = useQuery({
    queryKey: ["fees", user?.id, isAdmin, isStaff],
    queryFn: async () => {
      if (isAdmin) {
        // Admin sees all fees
        const { data, error } = await supabase
          .from("claim_fees")
          .select("*");
        if (error) throw error;
        return data;
      } else if (isStaff && user?.id) {
        // Staff sees fees from claims they're assigned to
        const { data: assignedClaims, error: claimsError } = await supabase
          .from("claim_staff")
          .select("claim_id")
          .eq("staff_id", user.id);
        
        if (claimsError) throw claimsError;
        
        const claimIds = assignedClaims?.map(c => c.claim_id) || [];
        
        if (claimIds.length === 0) return [];
        
        const { data, error } = await supabase
          .from("claim_fees")
          .select("*")
          .in("claim_id", claimIds);
        
        if (error) throw error;
        return data;
      }
      return [];
    },
    enabled: isAdmin || isStaff,
  });

  // Fetch all payments made (admin only)
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_payments")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Fetch contractor payments (for contractors only)
  const { data: contractorPayments, isLoading: contractorPaymentsLoading } = useQuery({
    queryKey: ["contractor-payments", contractorId],
    queryFn: async () => {
      if (!contractorId) return [];
      
      const { data, error } = await supabase
        .from("claim_payments")
        .select("*")
        .eq("recipient_type", "contractor")
        .eq("recipient_id", contractorId);
      
      if (error) throw error;
      return data;
    },
    enabled: isContractor && !!contractorId,
  });

  const isLoading = settlementsLoading || checksLoading || expensesLoading || feesLoading || paymentsLoading || contractorPaymentsLoading;

  // Calculate totals based on role
  const totalSettlements = isAdmin ? (settlements?.reduce((sum, s) => sum + (Number(s.total_settlement) || 0), 0) || 0) : 0;
  const totalChecksReceived = isAdmin ? (checks?.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0) : 0;
  const totalExpenses = isAdmin ? (expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0) : 0;
  const totalPaymentsMade = isAdmin ? (payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0) : 0;
  const totalCompanyFees = (isAdmin || isStaff) ? (fees?.reduce((sum, f) => sum + (Number(f.company_fee_amount) || 0), 0) || 0) : 0;
  const totalAdjusterFees = (isAdmin || isStaff) ? (fees?.reduce((sum, f) => sum + (Number(f.adjuster_fee_amount) || 0), 0) || 0) : 0;
  const checksOutstanding = isAdmin ? (totalSettlements - totalChecksReceived) : 0;
  const netProfit = isAdmin ? (totalCompanyFees - totalAdjusterFees - totalExpenses) : 0;
  
  // Contractor totals
  const contractorCollections = isContractor ? (contractorPayments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0) : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handleOpenPayment = () => {
    setPaymentRecipient({ name: '' });
    setQbPaymentOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Contractor View
  if (isContractor) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Collections</h1>
          <p className="text-muted-foreground mt-2">
            Track your payments and collections
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">
                Total Collections
              </CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {formatCurrency(contractorCollections)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total payments received
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Payment History</CardTitle>
            <CardDescription className="text-muted-foreground">
              Your recent payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {contractorPayments && contractorPayments.length > 0 ? (
              <div className="space-y-2">
                {contractorPayments.map((payment) => (
                  <div key={payment.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-medium text-foreground">{payment.payment_method}</p>
                      <p className="text-sm text-muted-foreground">{new Date(payment.payment_date).toLocaleDateString()}</p>
                    </div>
                    <p className="font-semibold text-green-500">{formatCurrency(Number(payment.amount))}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No payments yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Staff View - Only their fees
  if (isStaff) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Fees</h1>
          <p className="text-muted-foreground mt-2">
            Track your fees from assigned claims
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">
                Company Fees
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {formatCurrency(totalCompanyFees)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From your assigned claims
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">
                Adjuster Fees
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {formatCurrency(totalAdjusterFees)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From your assigned claims
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Fee Summary</CardTitle>
            <CardDescription className="text-muted-foreground">
              Breakdown of your fees from assigned claims
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fees && fees.length > 0 ? (
              <div className="space-y-2">
                {fees.map((fee) => (
                  <div key={fee.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm text-muted-foreground">Company Fee: {formatCurrency(Number(fee.company_fee_amount))}</p>
                      <p className="text-sm text-muted-foreground">Adjuster Fee: {formatCurrency(Number(fee.adjuster_fee_amount))}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No fees recorded yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin View - Full dashboard
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sales Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Track financial metrics and company performance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Create Invoice
          </Button>
          <Button onClick={handleOpenPayment}>
            <CreditCard className="h-4 w-4 mr-2" />
            Pay via QuickBooks
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Total Settlements
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totalSettlements)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total value of all settlements
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Checks Received
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency(totalChecksReceived)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total checks collected
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Total Expenses
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All business expenses
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Checks Outstanding
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              {formatCurrency(checksOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Settlements not yet received
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Payments Made
            </CardTitle>
            <Receipt className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {formatCurrency(totalPaymentsMade)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              To contractors, referrers, clients
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Net Profit
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Company Fees - Adjuster Fees - Expenses
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Financial Summary</CardTitle>
          <CardDescription className="text-muted-foreground">
            Detailed breakdown of all financial metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="text-muted-foreground">Total Settlements:</p>
              <p className="text-muted-foreground">Checks Received:</p>
              <p className="text-muted-foreground">Outstanding:</p>
            </div>
            <div className="space-y-2 text-right">
              <p className="font-medium text-foreground">{formatCurrency(totalSettlements)}</p>
              <p className="font-medium text-green-500">{formatCurrency(totalChecksReceived)}</p>
              <p className="font-medium text-yellow-500">{formatCurrency(checksOutstanding)}</p>
            </div>
          </div>
          
          <div className="border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p className="text-muted-foreground">Company Fees:</p>
                <p className="text-muted-foreground">Adjuster Fees:</p>
                <p className="text-muted-foreground">Total Expenses:</p>
                <p className="font-semibold text-foreground">Net Profit:</p>
              </div>
              <div className="space-y-2 text-right">
                <p className="font-medium text-green-500">{formatCurrency(totalCompanyFees)}</p>
                <p className="font-medium text-red-500">{formatCurrency(totalAdjusterFees)}</p>
                <p className="font-medium text-red-500">{formatCurrency(totalExpenses)}</p>
                <p className={`font-bold text-lg ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(netProfit)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {paymentRecipient && (
        <QuickBooksPaymentDialog
          open={qbPaymentOpen}
          onOpenChange={setQbPaymentOpen}
          recipientName={paymentRecipient.name}
          recipientEmail={paymentRecipient.email}
        />
      )}

      <InvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
      />
    </div>
  );
};

export default Sales;