import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, DollarSign, Clock, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  const { data: claims } = useQuery({
    queryKey: ["dashboard-claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const totalClaims = claims?.length || 0;
  const activeClaims = claims?.filter(c => c.status !== "closed" && c.status !== "settled")?.length || 0;
  const totalValue = claims?.reduce((sum, c) => sum + (c.claim_amount || 0), 0) || 0;
  const approvedClaims = claims?.filter(c => c.status === "approved" || c.status === "settled")?.length || 0;

  const recentClaims = claims?.slice(0, 5) || [];

  const stats = [
    {
      title: "Total Claims",
      value: totalClaims.toString(),
      icon: FileText,
    },
    {
      title: "Active Claims",
      value: activeClaims.toString(),
      icon: Clock,
    },
    {
      title: "Total Value",
      value: `$${(totalValue / 1000000).toFixed(1)}M`,
      icon: DollarSign,
    },
    {
      title: "Approved",
      value: approvedClaims.toString(),
      icon: CheckCircle,
    },
  ];

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
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Claims</CardTitle>
        </CardHeader>
        <CardContent>
          {recentClaims.length === 0 ? (
            <p className="text-sm text-muted-foreground">No claims yet</p>
          ) : (
            <div className="space-y-4">
              {recentClaims.map((claim) => (
                <div 
                  key={claim.id}
                  className="flex items-center gap-4 cursor-pointer hover:bg-accent/50 p-2 rounded-lg transition-colors"
                  onClick={() => navigate(`/claims/${claim.id}`)}
                >
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{claim.policyholder_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {claim.claim_number} • {claim.created_at ? formatDistanceToNow(new Date(claim.created_at), { addSuffix: true }) : 'Recently'}
                    </p>
                  </div>
                  {claim.status && (
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                      {claim.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
