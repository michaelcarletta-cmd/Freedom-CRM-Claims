import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, MapPin } from "lucide-react";
import { ClaimAssignments } from "./ClaimAssignments";

interface ClaimAssignedProps {
  claim: any;
}

export function ClaimAssigned({ claim }: ClaimAssignedProps) {
  return (
    <div className="grid gap-6">
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

      {/* Mortgage Company Information */}
      {claim.mortgage_company_id && (
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

      {/* Claim Assignments (Staff, Contractors, Referrers) */}
      <ClaimAssignments 
        claimId={claim.id}
        currentReferrerId={claim.referrer_id}
        currentMortgageCompanyId={claim.mortgage_company_id}
        loanNumber={claim.loan_number}
        ssnLastFour={claim.ssn_last_four}
      />
    </div>
  );
}
