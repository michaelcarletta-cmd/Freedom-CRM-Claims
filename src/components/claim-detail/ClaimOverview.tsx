import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Calendar, MapPin, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { ClaimAssignments } from "./ClaimAssignments";
import { ClaimCustomFields } from "./ClaimCustomFields";

interface ClaimOverviewProps {
  claim: any;
}

export function ClaimOverview({ claim }: ClaimOverviewProps) {
  return (
    <div className="grid gap-6">
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
              <p className="text-sm font-medium">
                {claim.loss_date ? format(new Date(claim.loss_date), "MMM dd, yyyy") : "N/A"}
              </p>
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

      {/* Claim Assignments */}
      <ClaimAssignments 
        claimId={claim.id}
        currentReferrerId={claim.referrer_id}
        currentMortgageCompanyId={claim.mortgage_company_id}
      />

      {/* Custom Fields */}
      <ClaimCustomFields claimId={claim.id} />
    </div>
  );
}
