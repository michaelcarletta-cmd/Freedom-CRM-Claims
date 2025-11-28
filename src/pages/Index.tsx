import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const Index = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back! Here's your claims overview</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">New claim submitted</p>
                <p className="text-xs text-muted-foreground">CLM-2024-005 • 2 hours ago</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-2 w-2 rounded-full bg-success" />
              <div className="flex-1">
                <p className="text-sm font-medium">Claim approved</p>
                <p className="text-xs text-muted-foreground">CLM-2024-001 • 5 hours ago</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-2 w-2 rounded-full bg-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium">Document review pending</p>
                <p className="text-xs text-muted-foreground">CLM-2024-002 • 1 day ago</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
