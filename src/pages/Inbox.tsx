import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, FileSignature, ArrowRight, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const Inbox = () => {
  const navigate = useNavigate();

  // Fetch all emails with claim information
  const { data: emails, isLoading: emailsLoading } = useQuery({
    queryKey: ["inbox-emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select(`
          *,
          claims (
            id,
            claim_number,
            policyholder_name
          )
        `)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch all signature requests with claim information
  const { data: signatureRequests, isLoading: signaturesLoading } = useQuery({
    queryKey: ["inbox-signatures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select(`
          *,
          claims (
            id,
            claim_number,
            policyholder_name
          ),
          signature_signers (
            id,
            signer_name,
            signer_email,
            status
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const isLoading = emailsLoading || signaturesLoading;

  const handleEmailClick = (claimId: string) => {
    navigate(`/claims/${claimId}`);
  };

  const handleSignatureClick = (claimId: string) => {
    navigate(`/claims/${claimId}`);
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
      completed: "bg-green-500/20 text-green-500 border-green-500/30",
      declined: "bg-red-500/20 text-red-500 border-red-500/30",
    };

    return (
      <Badge className={`${statusColors[status] || "bg-muted"} border`}>
        {status}
      </Badge>
    );
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
        <h1 className="text-3xl font-bold text-foreground">Inbox</h1>
        <p className="text-muted-foreground mt-2">
          Manage all emails and signature requests
        </p>
      </div>

      <Tabs defaultValue="emails" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="emails" className="data-[state=active]:bg-background">
            <Mail className="h-4 w-4 mr-2" />
            Emails ({emails?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="signatures" className="data-[state=active]:bg-background">
            <FileSignature className="h-4 w-4 mr-2" />
            Signature Requests ({signatureRequests?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="space-y-4">
          {!emails || emails.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No emails found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {emails.map((email) => (
                <Card
                  key={email.id}
                  className="bg-card border-border hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => email.claims && handleEmailClick(email.claims.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-primary" />
                          <CardTitle className="text-base text-foreground">
                            {email.subject}
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>To: {email.recipient_name || email.recipient_email}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(email.sent_at || email.created_at), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                        </div>
                      </div>
                      {email.claims && (
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="border-primary/30 text-primary">
                            {email.claims.claim_number || "No Claim #"}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {email.claims && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Claim: </span>
                        {email.claims.policyholder_name}
                      </div>
                    )}
                    {email.recipient_type && (
                      <div className="text-sm text-muted-foreground mt-1">
                        <span className="font-medium text-foreground">Type: </span>
                        {email.recipient_type}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="signatures" className="space-y-4">
          {!signatureRequests || signatureRequests.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="flex flex-col items-center justify-center py-10">
                <FileSignature className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No signature requests found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {signatureRequests.map((request) => (
                <Card
                  key={request.id}
                  className="bg-card border-border hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => request.claims && handleSignatureClick(request.claims.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <FileSignature className="h-4 w-4 text-primary" />
                          <CardTitle className="text-base text-foreground">
                            {request.document_name}
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                          <span>•</span>
                          {getStatusBadge(request.status)}
                        </div>
                      </div>
                      {request.claims && (
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="border-primary/30 text-primary">
                            {request.claims.claim_number || "No Claim #"}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {request.claims && (
                      <div className="text-sm text-muted-foreground mb-2">
                        <span className="font-medium text-foreground">Claim: </span>
                        {request.claims.policyholder_name}
                      </div>
                    )}
                    {request.signature_signers && request.signature_signers.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Signers:</p>
                        {request.signature_signers.map((signer: any) => (
                          <div key={signer.id} className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>{signer.signer_name} ({signer.signer_email})</span>
                            {getStatusBadge(signer.status)}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Inbox;
