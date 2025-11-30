import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ClaimNotes } from "@/components/claim-detail/ClaimNotes";
import { ClaimEmails } from "@/components/claim-detail/ClaimEmails";
import { ClaimCommunications } from "@/components/claim-detail/ClaimCommunications";
import { ClaimFiles } from "@/components/claim-detail/ClaimFiles";
import { ClaimTimeline } from "@/components/claim-detail/ClaimTimeline";
import { ClaimStatusSelect } from "@/components/ClaimStatusSelect";
import { ArrowLeft, Edit, MapPin, DollarSign, Calendar, User } from "lucide-react";
import { format } from "date-fns";

const ClaimDetail = () => {
  const { id } = useParams();
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchClaim();
    }
  }, [id]);

  const fetchClaim = async () => {
    try {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setClaim(data);
    } catch (error) {
      console.error("Error fetching claim:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (claim) {
      setClaim({ ...claim, status: newStatus });
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!claim) {
    return <div className="p-8">Claim not found</div>;
  }

  const getStatusClassName = (status: string) => {
    const classes: Record<string, string> = {
      new: "bg-accent text-accent-foreground",
      in_progress: "bg-primary text-primary-foreground",
      under_review: "bg-warning text-warning-foreground",
      approved: "bg-success text-success-foreground",
      rejected: "bg-destructive text-destructive-foreground",
    };
    return classes[status] || "bg-secondary";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/claims">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">{claim.claim_number}</h1>
            <ClaimStatusSelect 
              claimId={claim.id} 
              currentStatus={claim.status}
              onStatusChange={handleStatusChange}
            />
          </div>
          <p className="text-muted-foreground mt-1">{claim.policyholder_name}</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Edit className="h-4 w-4 mr-2" />
          Edit Claim
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Policyholder Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Policyholder Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="text-sm font-medium">{claim.policyholder_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{claim.policyholder_email || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{claim.policyholder_phone || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="text-sm font-medium">{claim.policyholder_address || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loss Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Loss Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Date of Loss</p>
                  <p className="text-sm font-medium">{claim.loss_date ? format(new Date(claim.loss_date), "MMM dd, yyyy") : "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Type of Loss</p>
                  <p className="text-sm font-medium">{claim.loss_type || "N/A"}</p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <p className="text-sm text-muted-foreground">Loss Description</p>
                  <p className="text-sm font-medium">{claim.loss_description || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Insurance Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Insurance Company
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Company Name</p>
                  <p className="text-sm font-medium">{claim.insurance_company || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Policy Number</p>
                  <p className="text-sm font-medium">N/A</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{claim.insurance_phone || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{claim.insurance_email || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Adjuster Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Adjuster Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Adjuster Name</p>
                  <p className="text-sm font-medium">{claim.adjuster_name || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="text-sm font-medium">{claim.insurance_company || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{claim.adjuster_phone || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{claim.adjuster_email || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Claim Financial Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Claim Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Claim Amount</p>
                  <p className="text-2xl font-bold text-primary">
                    {claim.claim_amount ? `$${claim.claim_amount.toLocaleString()}` : "N/A"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Date Submitted</p>
                  <p className="text-sm font-medium">
                    {claim.created_at ? format(new Date(claim.created_at), "MMM dd, yyyy") : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabbed Sections */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="notes" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="emails">Emails</TabsTrigger>
                  <TabsTrigger value="communications">Phone/Text</TabsTrigger>
                  <TabsTrigger value="files">Files</TabsTrigger>
                </TabsList>
                <TabsContent value="notes" className="mt-6">
                  <ClaimNotes claimId={id || ""} />
                </TabsContent>
                <TabsContent value="emails" className="mt-6">
                  <ClaimEmails claimId={id || ""} />
                </TabsContent>
                <TabsContent value="communications" className="mt-6">
                  <ClaimCommunications claimId={id || ""} />
                </TabsContent>
                <TabsContent value="files" className="mt-6">
                  <ClaimFiles claimId={id || ""} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Timeline Sidebar - Right 1/3 */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimTimeline claimId={id || ""} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ClaimDetail;
