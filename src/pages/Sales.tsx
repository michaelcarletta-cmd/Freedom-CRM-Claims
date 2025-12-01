import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, DollarSign, TrendingUp, TrendingDown, Receipt, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Sales = () => {
  const { userRole } = useAuth();

  // Fetch all settlements
  const { data: settlements, isLoading: settlementsLoading } = useQuery({
    queryKey: ["settlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_settlements")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all checks received
  const { data: checks, isLoading: checksLoading } = useQuery({
    queryKey: ["checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_checks")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all expenses
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_expenses")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all fees
  const { data: fees, isLoading: feesLoading } = useQuery({
    queryKey: ["fees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_fees")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all payments made
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_payments")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const isLoading = settlementsLoading || checksLoading || expensesLoading || feesLoading || paymentsLoading;

  // Calculate totals
  const totalSettlements = settlements?.reduce((sum, s) => sum + (Number(s.total_settlement) || 0), 0) || 0;
  const totalChecksReceived = checks?.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0;
  const totalExpenses = expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;
  const totalPaymentsMade = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
  const totalAdjusterFees = fees?.reduce((sum, f) => sum + (Number(f.adjuster_fee_amount) || 0), 0) || 0;
  const checksOutstanding = totalSettlements - totalChecksReceived;
  const netProfit = totalChecksReceived - totalExpenses - totalPaymentsMade - totalAdjusterFees;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Sales Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Track financial metrics and company performance
        </p>
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
              Checks - Expenses - Payments - Fees
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
                <p className="text-muted-foreground">Total Expenses:</p>
                <p className="text-muted-foreground">Payments Made:</p>
                <p className="text-muted-foreground">Adjuster Fees:</p>
                <p className="font-semibold text-foreground">Net Profit:</p>
              </div>
              <div className="space-y-2 text-right">
                <p className="font-medium text-red-500">{formatCurrency(totalExpenses)}</p>
                <p className="font-medium text-red-500">{formatCurrency(totalPaymentsMade)}</p>
                <p className="font-medium text-red-500">{formatCurrency(totalAdjusterFees)}</p>
                <p className={`font-bold text-lg ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(netProfit)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Sales;
