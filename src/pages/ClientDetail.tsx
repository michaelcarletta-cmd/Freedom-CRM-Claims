import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ArrowLeft, 
  Edit, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  FileText,
  MessageSquare,
  Eye,
  DollarSign
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EditClientDialog } from "@/components/EditClientDialog";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string;
}

const mockClientClaims = [
  {
    id: "1",
    claimNumber: "CLM-2024-001",
    propertyAddress: "123 Main St, Springfield",
    claimAmount: "$45,000",
    status: "approved",
    dateSubmitted: "2024-01-15",
  },
  {
    id: "2",
    claimNumber: "CLM-2023-087",
    propertyAddress: "789 Elm St, Springfield",
    claimAmount: "$28,500",
    status: "approved",
    dateSubmitted: "2023-11-20",
  },
  {
    id: "3",
    claimNumber: "CLM-2023-042",
    propertyAddress: "321 Pine Rd, Springfield",
    claimAmount: "$5,000",
    status: "rejected",
    dateSubmitted: "2023-08-30",
  },
];

const mockCommunications = [
  {
    id: "1",
    type: "phone",
    subject: "Follow-up on claim approval",
    date: "2024-01-20 10:15 AM",
    notes: "Discussed repair timeline and contractor scheduling.",
  },
  {
    id: "2",
    type: "email",
    subject: "Document submission",
    date: "2024-01-18 3:45 PM",
    notes: "Client sent additional documentation for review.",
  },
  {
    id: "3",
    type: "text",
    subject: "Quick question about estimate",
    date: "2024-01-16 2:30 PM",
    notes: "Clarified repair estimate details.",
  },
];

const mockDocuments = [
  {
    id: "1",
    name: "Driver_License.pdf",
    uploadedAt: "2023-08-15",
    type: "ID",
  },
  {
    id: "2",
    name: "Proof_of_Ownership.pdf",
    uploadedAt: "2023-08-15",
    type: "Property",
  },
  {
    id: "3",
    name: "Insurance_Policy_2024.pdf",
    uploadedAt: "2024-01-10",
    type: "Insurance",
  },
];

const ClientDetail = () => {
  const { id } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [claims, setClaims] = useState<any[]>([]);

  const fetchClient = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setClient(data);

      // Fetch claims for this client
      const { data: claimsData } = await supabase
        .from("claims")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false });

      setClaims(claimsData || []);
    } catch (error) {
      console.error("Error fetching client:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClient();
  }, [id]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading client...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-muted-foreground mb-4">Client not found</p>
        <Link to="/clients">
          <Button>Back to Clients</Button>
        </Link>
      </div>
    );
  }

  const mockClient = {
    ...client,
    dateAdded: client.created_at,
    totalClaims: claims.length,
    activeClaims: claims.filter(c => c.status !== "approved" && c.status !== "rejected").length,
    totalClaimValue: "$0",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/clients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary text-primary-foreground text-lg">
            {mockClient.name.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">{mockClient.name}</h1>
          <p className="text-muted-foreground mt-1">Client since {new Date(mockClient.dateAdded).toLocaleDateString()}</p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90"
          onClick={() => setIsEditDialogOpen(true)}
        >
          <Edit className="h-4 w-4 mr-2" />
          Edit Client
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{mockClient.totalClaims}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{mockClient.activeClaims}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Claim Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{mockClient.totalClaimValue}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">2 days ago</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{mockClient.email}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{mockClient.phone}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="text-sm font-medium">
                    {[mockClient.street, mockClient.city, mockClient.state, mockClient.zip_code]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="claims" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="claims">Claims History</TabsTrigger>
                  <TabsTrigger value="communications">Communications</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                </TabsList>

                <TabsContent value="claims" className="mt-6 space-y-4">
                  {claims.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No claims found for this client</p>
                  ) : (
                    claims.map((claim) => (
                    <div
                      key={claim.id}
                      className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                    >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-foreground">{claim.claim_number}</p>
                            <p className="text-sm text-muted-foreground mt-1">{claim.policyholder_address || "No address"}</p>
                          </div>
                          <Badge className={getStatusClassName(claim.status)}>
                            {claim.status?.replace("_", " ").toUpperCase() || "UNKNOWN"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {claim.claim_amount && (
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4" />
                                <span className="font-semibold text-foreground">${claim.claim_amount.toLocaleString()}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <Link to={`/claims/${claim.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="communications" className="mt-6 space-y-4">
                  {mockCommunications.map((comm) => (
                    <div
                      key={comm.id}
                      className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          comm.type === "phone" ? "bg-primary/10" : 
                          comm.type === "email" ? "bg-accent/10" : "bg-success/10"
                        }`}>
                          {comm.type === "phone" ? (
                            <Phone className="h-4 w-4 text-primary" />
                          ) : comm.type === "email" ? (
                            <Mail className="h-4 w-4 text-accent" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-success" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">{comm.subject}</span>
                            <Badge variant="outline" className="text-xs">
                              {comm.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{comm.notes}</p>
                          <span className="text-xs text-muted-foreground">{comm.date}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="documents" className="mt-6 space-y-4">
                  {mockDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{doc.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{doc.type}</Badge>
                              <span className="text-xs text-muted-foreground">
                                Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Phone className="h-4 w-4 mr-2" />
                Log Phone Call
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <MessageSquare className="h-4 w-4 mr-2" />
                Send Message
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2" />
                Add Document
              </Button>
              <Separator className="my-4" />
              <Button className="w-full bg-primary hover:bg-primary/90">
                <FileText className="h-4 w-4 mr-2" />
                Create New Claim
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <EditClientDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        client={client}
        onClientUpdated={fetchClient}
      />
    </div>
  );
};

export default ClientDetail;
