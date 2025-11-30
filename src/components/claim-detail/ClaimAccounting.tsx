import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface ClaimAccountingProps {
  claim: any;
}

export function ClaimAccounting({ claim }: ClaimAccountingProps) {
  // Mock financial data - replace with actual data
  const transactions = [
    { id: 1, date: "2024-01-15", description: "Initial claim assessment", type: "Estimate", amount: 45000 },
    { id: 2, date: "2024-01-20", description: "Payment to contractor", type: "Payment", amount: -15000 },
    { id: 3, date: "2024-02-01", description: "Additional repairs", type: "Estimate", amount: 8500 },
  ];

  const totalEstimate = claim.claim_amount || 0;
  const totalPaid = 15000;
  const balance = totalEstimate - totalPaid;

  return (
    <div className="space-y-6">
      {/* Financial Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Claim Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              ${totalEstimate.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              Total Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              ${totalPaid.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Remaining Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">
              ${balance.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{format(new Date(transaction.date), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      transaction.type === "Payment" 
                        ? "bg-destructive/10 text-destructive" 
                        : "bg-success/10 text-success"
                    }`}>
                      {transaction.type}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${
                    transaction.amount < 0 ? "text-destructive" : "text-success"
                  }`}>
                    {transaction.amount < 0 ? "-" : "+"}${Math.abs(transaction.amount).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Initial Payment</p>
                <p className="text-sm text-muted-foreground">Due: Jan 20, 2024</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-success">$15,000</p>
                <p className="text-xs text-success">Paid</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Mid-Project Payment</p>
                <p className="text-sm text-muted-foreground">Due: Feb 15, 2024</p>
              </div>
              <div className="text-right">
                <p className="font-bold">$15,000</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Final Payment</p>
                <p className="text-sm text-muted-foreground">Due: Mar 1, 2024</p>
              </div>
              <div className="text-right">
                <p className="font-bold">$15,000</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
