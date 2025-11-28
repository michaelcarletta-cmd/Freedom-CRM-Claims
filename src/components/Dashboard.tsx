import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimsTable } from "./ClaimsTable";
import { FileText, DollarSign, Clock, CheckCircle } from "lucide-react";

const stats = [
  {
    title: "Total Claims",
    value: "124",
    icon: FileText,
    trend: "+12% from last month",
  },
  {
    title: "Active Claims",
    value: "43",
    icon: Clock,
    trend: "18 need attention",
  },
  {
    title: "Total Value",
    value: "$2.4M",
    icon: DollarSign,
    trend: "+8% from last month",
  },
  {
    title: "Approved",
    value: "67",
    icon: CheckCircle,
    trend: "54% approval rate",
  },
];

export const Dashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-foreground">Property Claims CRM</h1>
          <p className="text-muted-foreground mt-1">Manage and track your property insurance claims</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="transition-all hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-2">{stat.trend}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Recent Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
