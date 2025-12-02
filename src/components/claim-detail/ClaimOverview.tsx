import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Calendar, MapPin, DollarSign, Mail, UserPlus, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ClaimAssignments } from "./ClaimAssignments";
import { ClaimCustomFields } from "./ClaimCustomFields";
import { CredentialsDialog } from "@/components/CredentialsDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ClaimOverviewProps {
  claim: any;
  isPortalUser?: boolean;
  onClaimUpdated?: (claim: any) => void;
}

// Generate claim-specific email address using policy number
const getClaimEmail = (claim: any): string => {
  const domain = "claims.freedom.com";
  if (claim.policy_number) {
    const sanitized = claim.policy_number
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `claim-${sanitized}@${domain}`;
  }
  return claim.claim_email_id ? `claim-${claim.claim_email_id}@${domain}` : '';
};

export function ClaimOverview({ claim, isPortalUser = false, onClaimUpdated }: ClaimOverviewProps) {
  const [creatingPortal, setCreatingPortal] = useState(false);
  const [hasPortalAccess, setHasPortalAccess] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentials, setCredentials] = useState({ email: "", password: "" });

  // Check if client already has portal access
  useEffect(() => {
    const checkPortalAccess = async () => {
      if (claim.client_id) {
        const { data } = await supabase
          .from("clients")
          .select("user_id")
          .eq("id", claim.client_id)
          .single();
        setHasPortalAccess(!!data?.user_id);
      } else {
        setHasPortalAccess(false);
      }
    };
    checkPortalAccess();
  }, [claim.client_id]);

  const handleCreatePortalAccess = async () => {
    if (!claim.policyholder_email) {
      toast.error("Policyholder email is required to create portal access");
      return;
    }

    setCreatingPortal(true);
    try {
      const tempPassword = Math.random().toString(36).slice(-8) + "A1!";

      // Create portal user via edge function
      const { data: userData, error: userError } = await supabase.functions.invoke(
        "create-portal-user",
        {
          body: {
            email: claim.policyholder_email,
            password: tempPassword,
            fullName: claim.policyholder_name,
            role: "client",
            phone: claim.policyholder_phone,
          },
        }
      );

      if (userError) throw userError;
      if (userData?.error) throw new Error(userData.error);

      const userId = userData?.userId;
      if (!userId) throw new Error("Failed to create user account");

      let clientId = claim.client_id;

      // Create or update client record
      if (!clientId) {
        // Check if client already exists with this email
        const { data: existingClient } = await supabase
          .from("clients")
          .select("id")
          .eq("email", claim.policyholder_email)
          .single();

        if (existingClient) {
          // Update existing client with user_id
          await supabase
            .from("clients")
            .update({ user_id: userId })
            .eq("id", existingClient.id);
          clientId = existingClient.id;
        } else {
          // Create new client
          const { data: newClient, error: clientError } = await supabase
            .from("clients")
            .insert({
              name: claim.policyholder_name,
              email: claim.policyholder_email,
              phone: claim.policyholder_phone,
              user_id: userId,
            })
            .select()
            .single();

          if (clientError) throw clientError;
          clientId = newClient.id;
        }

        // Link client to claim
        const { error: updateError } = await supabase
          .from("claims")
          .update({ client_id: clientId })
          .eq("id", claim.id);

        if (updateError) throw updateError;

        // Update parent component
        if (onClaimUpdated) {
          onClaimUpdated({ ...claim, client_id: clientId });
        }
      } else {
        // Update existing client with user_id
        await supabase
          .from("clients")
          .update({ user_id: userId })
          .eq("id", clientId);
      }

      setHasPortalAccess(true);
      
      // Only show credentials dialog if this is a new user
      if (!userData?.existingUser) {
        setCredentials({ email: claim.policyholder_email, password: tempPassword });
        setCredentialsOpen(true);
        toast.success("Portal access created successfully");
      } else {
        toast.success("Portal access linked to existing account");
      }
    } catch (error: any) {
      console.error("Error creating portal access:", error);
      toast.error(error.message || "Failed to create portal access");
    } finally {
      setCreatingPortal(false);
    }
  };

  return (
    <div className="grid gap-6">
      {/* Policyholder Information */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Policyholder Information
          </CardTitle>
          {!isPortalUser && claim.policyholder_email && (
            hasPortalAccess ? (
              <span className="flex items-center gap-1 text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
                <Check className="h-3 w-3" />
                Portal Access Active
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreatePortalAccess}
                disabled={creatingPortal}
              >
                {creatingPortal ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Create Portal Access
              </Button>
            )
          )}
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
              <p className="text-sm font-medium">
                {claim.loss_date ? format(new Date(claim.loss_date), "MMM dd, yyyy") : "N/A"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Type of Loss</p>
              <p className="text-sm font-medium">{claim.loss_type || "N/A"}</p>
            </div>
            {!isPortalUser && getClaimEmail(claim) && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Claim Email
                </p>
                <p className="text-sm font-medium font-mono text-primary break-all">
                  {getClaimEmail(claim)}
                </p>
              </div>
            )}
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
            Insurance Company Information
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
              <p className="text-sm font-medium">{claim.policy_number || "N/A"}</p>
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

      {/* Claim Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Claim Summary
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

      {/* Mortgage Company Information - Hidden for portal users */}
      {!isPortalUser && claim.mortgage_company_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Mortgage Company Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Loan Number</p>
                <p className="text-sm font-medium">{claim.loan_number || "N/A"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">SSN Last Four</p>
                <p className="text-sm font-medium">{claim.ssn_last_four || "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Claim Assignments - Hidden for portal users */}
      {!isPortalUser && (
        <ClaimAssignments 
          claimId={claim.id}
          currentReferrerId={claim.referrer_id}
          currentMortgageCompanyId={claim.mortgage_company_id}
          loanNumber={claim.loan_number}
          ssnLastFour={claim.ssn_last_four}
        />
      )}

      {/* Custom Fields */}
      <ClaimCustomFields claimId={claim.id} />

      {/* Credentials Dialog */}
      <CredentialsDialog
        isOpen={credentialsOpen}
        onClose={() => setCredentialsOpen(false)}
        email={credentials.email}
        password={credentials.password}
        userType="Client"
        userName={claim.policyholder_name}
      />
    </div>
  );
}