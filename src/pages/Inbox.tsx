import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, FileSignature, ArrowRight, Clock, Bot } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { PendingApprovals } from "@/components/inbox/PendingApprovals";

const Inbox = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

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

  // Fetch pending AI actions count
  const { data: pendingCount } = useQuery({
    queryKey: ["pending-ai-actions-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("claim_ai_pending_actions")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
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
          Manage all emails, signature requests, and AI-drafted messages
        </p>
      </div>

      <Tabs defaultValue="approvals" className="space-y-4">
        <TabsList className="flex flex-row w-full bg-muted/40 p-2 rounded-lg gap-1 overflow-x-auto scrollbar-hide">
          <TabsTrigger value="approvals" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">
            <Bot className="h-4 w-4 mr-2" />
            AI Approvals {pendingCount ? `(${pendingCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="emails" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">
            <Mail className="h-4 w-4 mr-2" />
            Emails ({emails?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="signatures" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">
            <FileSignature className="h-4 w-4 mr-2" />
            Signature Requests ({signatureRequests?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="space-y-4">
          <PendingApprovals />
        </TabsContent>

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
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Signers:</p>
                        {request.signature_signers.map((signer: any) => (
                          <div key={signer.id} className="flex items-center justify-between text-sm">
                            <div className="flex-1">
                              <span className="text-foreground">{signer.signer_name}</span>
                              <span className="text-muted-foreground"> ({signer.signer_email})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(signer.status)}
                              {signer.status === "pending" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const signUrl = `${window.location.origin}/sign?token=${signer.access_token}`;
                                    navigator.clipboard.writeText(signUrl);
                                    toast({
                                      title: "Link copied",
                                      description: "Signing link copied to clipboard",
                                    });
                                  }}
                                >
                                  Copy Link
                                </Button>
                              )}
                            </div>
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
