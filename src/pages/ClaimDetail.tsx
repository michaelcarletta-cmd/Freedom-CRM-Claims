import { useParams } from "react-router-dom";
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
import { ArrowLeft, Edit, MapPin, DollarSign, Calendar, User } from "lucide-react";
import { Link } from "react-router-dom";

// Mock data - replace with actual API call
const mockClaim = {
  id: "1",
  claimNumber: "CLM-2024-001",
  clientName: "John Smith",
  propertyAddress: "123 Main St, Springfield, IL 62701",
  claimAmount: "$45,000",
  status: "approved" as const,
  dateSubmitted: "2024-01-15",
  insuranceCompany: "ABC Insurance Company",
  policyNumber: "POL-12345-67890",
  claimType: "Water Damage",
  adjusterName: "Sarah Mitchell",
  adjusterPhone: "(555) 123-4567",
  adjusterEmail: "sarah.mitchell@abcinsurance.com",
};

const ClaimDetail = () => {
  const { id } = useParams();

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
            <h1 className="text-3xl font-bold text-foreground">{mockClaim.claimNumber}</h1>
            <Badge className={getStatusClassName(mockClaim.status)}>
              {mockClaim.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">{mockClaim.clientName}</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Edit className="h-4 w-4 mr-2" />
          Edit Claim
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Claim Overview Card */}
          <Card>
            <CardHeader>
              <CardTitle>Claim Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="font-medium">Property Address</span>
                  </div>
                  <p className="text-sm pl-6">{mockClaim.propertyAddress}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span className="font-medium">Claim Amount</span>
                  </div>
                  <p className="text-sm pl-6 font-semibold text-foreground">{mockClaim.claimAmount}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium">Date Submitted</span>
                  </div>
                  <p className="text-sm pl-6">{new Date(mockClaim.dateSubmitted).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span className="font-medium">Insurance Company</span>
                  </div>
                  <p className="text-sm pl-6">{mockClaim.insuranceCompany}</p>
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Policy Number</p>
                  <p className="text-sm font-medium">{mockClaim.policyNumber}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Claim Type</p>
                  <p className="text-sm font-medium">{mockClaim.claimType}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Adjuster</p>
                  <p className="text-sm font-medium">{mockClaim.adjusterName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Adjuster Contact</p>
                  <p className="text-sm font-medium">{mockClaim.adjusterPhone}</p>
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
