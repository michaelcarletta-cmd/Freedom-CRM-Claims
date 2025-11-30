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
  status: "approved" as const,
  claimAmount: "$45,000",
  dateSubmitted: "2024-01-15",
  
  // Policyholder Information
  policyholderName: "John Smith",
  policyholderEmail: "john.smith@email.com",
  policyholderPhone: "(555) 987-6543",
  policyholderAddress: "123 Main St, Springfield, IL 62701",
  
  // Loss Information
  dateOfLoss: "2024-01-10",
  typeOfLoss: "Water Damage",
  lossDescription: "Pipe burst in master bathroom causing water damage to ceiling and walls",
  
  // Insurance Company Information
  insuranceCompany: "ABC Insurance Company",
  insurancePhone: "(555) 111-2222",
  insuranceEmail: "claims@abcinsurance.com",
  policyNumber: "POL-12345-67890",
  
  // Adjuster Information
  adjusterName: "Sarah Mitchell",
  adjusterPhone: "(555) 123-4567",
  adjusterEmail: "sarah.mitchell@abcinsurance.com",
  adjusterCompany: "ABC Insurance Company",
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
          <p className="text-muted-foreground mt-1">{mockClaim.policyholderName}</p>
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
                  <p className="text-sm font-medium">{mockClaim.policyholderName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{mockClaim.policyholderEmail}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{mockClaim.policyholderPhone}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="text-sm font-medium">{mockClaim.policyholderAddress}</p>
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
                  <p className="text-sm font-medium">{new Date(mockClaim.dateOfLoss).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Type of Loss</p>
                  <p className="text-sm font-medium">{mockClaim.typeOfLoss}</p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <p className="text-sm text-muted-foreground">Loss Description</p>
                  <p className="text-sm font-medium">{mockClaim.lossDescription}</p>
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
                  <p className="text-sm font-medium">{mockClaim.insuranceCompany}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Policy Number</p>
                  <p className="text-sm font-medium">{mockClaim.policyNumber}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{mockClaim.insurancePhone}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{mockClaim.insuranceEmail}</p>
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
                  <p className="text-sm font-medium">{mockClaim.adjusterName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="text-sm font-medium">{mockClaim.adjusterCompany}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{mockClaim.adjusterPhone}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{mockClaim.adjusterEmail}</p>
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
                  <p className="text-2xl font-bold text-primary">{mockClaim.claimAmount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Date Submitted</p>
                  <p className="text-sm font-medium">{new Date(mockClaim.dateSubmitted).toLocaleDateString()}</p>
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
