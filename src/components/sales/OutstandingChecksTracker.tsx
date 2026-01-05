import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface OutstandingCheck {
  id: string;
  check_number: string | null;
  payee: string;
  amount: number;
}

interface BankBalance {
  id: string;
  balance: number;
}

export function OutstandingChecksTracker() {
  const queryClient = useQueryClient();
  const [editingBankBalance, setEditingBankBalance] = useState(false);
  const [tempBankBalance, setTempBankBalance] = useState("");
  const [newCheck, setNewCheck] = useState({ check_number: "", payee: "", amount: "" });
  const [editingCheckId, setEditingCheckId] = useState<string | null>(null);
  const [editingCheck, setEditingCheck] = useState<OutstandingCheck | null>(null);

  // Fetch bank balance
  const { data: bankBalanceData, isLoading: bankBalanceLoading } = useQuery({
    queryKey: ["bank-balance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_balance")
        .select("*")
        .limit(1)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data as BankBalance | null;
    },
  });

  // Fetch outstanding checks
  const { data: checks, isLoading: checksLoading } = useQuery({
    queryKey: ["outstanding-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outstanding_checks")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as OutstandingCheck[];
    },
  });

  // Mutations
  const updateBankBalanceMutation = useMutation({
    mutationFn: async (balance: number) => {
      if (bankBalanceData?.id) {
        const { error } = await supabase
          .from("bank_balance")
          .update({ balance })
          .eq("id", bankBalanceData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bank_balance")
          .insert({ balance });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-balance"] });
      setEditingBankBalance(false);
      toast.success("Bank balance updated");
    },
    onError: () => {
      toast.error("Failed to update bank balance");
    },
  });

  const addCheckMutation = useMutation({
    mutationFn: async (check: { check_number: string; payee: string; amount: number }) => {
      const { error } = await supabase
        .from("outstanding_checks")
        .insert({
          check_number: check.check_number || null,
          payee: check.payee,
          amount: check.amount,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outstanding-checks"] });
      setNewCheck({ check_number: "", payee: "", amount: "" });
      toast.success("Check added");
    },
    onError: () => {
      toast.error("Failed to add check");
    },
  });

  const updateCheckMutation = useMutation({
    mutationFn: async (check: OutstandingCheck) => {
      const { error } = await supabase
        .from("outstanding_checks")
        .update({
          check_number: check.check_number,
          payee: check.payee,
          amount: check.amount,
        })
        .eq("id", check.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outstanding-checks"] });
      setEditingCheckId(null);
      setEditingCheck(null);
      toast.success("Check updated");
    },
    onError: () => {
      toast.error("Failed to update check");
    },
  });

  const deleteCheckMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("outstanding_checks")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outstanding-checks"] });
      toast.success("Check removed");
    },
    onError: () => {
      toast.error("Failed to remove check");
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const bankBalance = bankBalanceData?.balance || 0;
  const totalOutstandingChecks = checks?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  const trueBankBalance = bankBalance - totalOutstandingChecks;

  const handleSaveBankBalance = () => {
    const balance = parseFloat(tempBankBalance);
    if (isNaN(balance)) {
      toast.error("Please enter a valid amount");
      return;
    }
    updateBankBalanceMutation.mutate(balance);
  };

  const handleAddCheck = () => {
    if (!newCheck.payee.trim()) {
      toast.error("Payee is required");
      return;
    }
    const amount = parseFloat(newCheck.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    addCheckMutation.mutate({
      check_number: newCheck.check_number,
      payee: newCheck.payee,
      amount,
    });
  };

  const handleStartEdit = (check: OutstandingCheck) => {
    setEditingCheckId(check.id);
    setEditingCheck({ ...check });
  };

  const handleSaveEdit = () => {
    if (!editingCheck) return;
    if (!editingCheck.payee.trim()) {
      toast.error("Payee is required");
      return;
    }
    updateCheckMutation.mutate(editingCheck);
  };

  const handleCancelEdit = () => {
    setEditingCheckId(null);
    setEditingCheck(null);
  };

  if (bankBalanceLoading || checksLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Outstanding Checks Tracker
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Track checks that have been written but not yet cashed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bank Balance Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Bank Account Balance</label>
            {editingBankBalance ? (
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={tempBankBalance}
                  onChange={(e) => setTempBankBalance(e.target.value)}
                  className="bg-background"
                  placeholder="Enter balance..."
                />
                <Button size="sm" onClick={handleSaveBankBalance} disabled={updateBankBalanceMutation.isPending}>
                  <Save className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingBankBalance(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div 
                className="text-2xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors"
                onClick={() => {
                  setTempBankBalance(bankBalance.toString());
                  setEditingBankBalance(true);
                }}
              >
                {formatCurrency(bankBalance)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Total Outstanding Checks</label>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(totalOutstandingChecks)}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">True Bank Balance</label>
            <div className={`text-2xl font-bold ${trueBankBalance >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {formatCurrency(trueBankBalance)}
            </div>
            <p className="text-xs text-muted-foreground">Bank Balance - Outstanding Checks</p>
          </div>
        </div>

        {/* Add New Check */}
        <div className="flex flex-col sm:flex-row gap-2 p-4 bg-muted/20 rounded-lg border border-border">
          <Input
            placeholder="Check #"
            value={newCheck.check_number}
            onChange={(e) => setNewCheck({ ...newCheck, check_number: e.target.value })}
            className="bg-background sm:w-32"
          />
          <Input
            placeholder="Payee *"
            value={newCheck.payee}
            onChange={(e) => setNewCheck({ ...newCheck, payee: e.target.value })}
            className="bg-background flex-1"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Amount *"
            value={newCheck.amount}
            onChange={(e) => setNewCheck({ ...newCheck, amount: e.target.value })}
            className="bg-background sm:w-32"
          />
          <Button onClick={handleAddCheck} disabled={addCheckMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Add Check
          </Button>
        </div>

        {/* Checks Table */}
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-32">Check #</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead className="w-40 text-right">Amount</TableHead>
                <TableHead className="w-24 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks && checks.length > 0 ? (
                checks.map((check) => (
                  <TableRow key={check.id}>
                    {editingCheckId === check.id && editingCheck ? (
                      <>
                        <TableCell>
                          <Input
                            value={editingCheck.check_number || ""}
                            onChange={(e) => setEditingCheck({ ...editingCheck, check_number: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editingCheck.payee}
                            onChange={(e) => setEditingCheck({ ...editingCheck, payee: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={editingCheck.amount}
                            onChange={(e) => setEditingCheck({ ...editingCheck, amount: parseFloat(e.target.value) || 0 })}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={handleSaveEdit} disabled={updateCheckMutation.isPending}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                              ✕
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell 
                          className="cursor-pointer hover:text-primary transition-colors"
                          onClick={() => handleStartEdit(check)}
                        >
                          {check.check_number || "-"}
                        </TableCell>
                        <TableCell 
                          className="cursor-pointer hover:text-primary transition-colors"
                          onClick={() => handleStartEdit(check)}
                        >
                          {check.payee}
                        </TableCell>
                        <TableCell 
                          className="text-right cursor-pointer hover:text-primary transition-colors"
                          onClick={() => handleStartEdit(check)}
                        >
                          {formatCurrency(Number(check.amount))}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteCheckMutation.mutate(check.id)}
                            disabled={deleteCheckMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No outstanding checks. Add one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
