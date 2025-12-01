import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Building2, UserPlus, X } from "lucide-react";

interface ClaimAssignmentsProps {
  claimId: string;
  currentReferrerId?: string | null;
  currentMortgageCompanyId?: string | null;
}

interface Contractor {
  id: string;
  full_name: string | null;
  email: string;
}

interface Referrer {
  id: string;
  name: string;
  company: string | null;
}

interface MortgageCompany {
  id: string;
  name: string;
  contact_name: string | null;
}

interface AssignedContractor {
  contractor_id: string;
  profiles: Contractor;
}

interface Staff {
  id: string;
  full_name: string | null;
  email: string;
}

interface AssignedStaff {
  staff_id: string;
  profiles: Staff;
}

export function ClaimAssignments({ claimId, currentReferrerId, currentMortgageCompanyId }: ClaimAssignmentsProps) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assignedStaff, setAssignedStaff] = useState<AssignedStaff[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [assignedContractors, setAssignedContractors] = useState<AssignedContractor[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [mortgageCompanies, setMortgageCompanies] = useState<MortgageCompany[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [selectedContractor, setSelectedContractor] = useState<string>("");
  const [selectedReferrer, setSelectedReferrer] = useState<string>(currentReferrerId || "none");
  const [selectedMortgageCompany, setSelectedMortgageCompany] = useState<string>(currentMortgageCompanyId || "none");

  useEffect(() => {
    fetchData();
  }, [claimId]);

  const fetchData = async () => {
    // Fetch all staff (users with staff role)
    const { data: staffRoleData } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "staff");

    if (staffRoleData) {
      const staffIds = staffRoleData.map((r) => r.user_id);
      const { data: staffProfileData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", staffIds);
      
      setStaff(staffProfileData || []);
    }

    // Fetch assigned staff for this claim
    const { data: assignedStaffData } = await supabase
      .from("claim_staff")
      .select("staff_id")
      .eq("claim_id", claimId);

    if (assignedStaffData && assignedStaffData.length > 0) {
      const staffIds = assignedStaffData.map((as) => as.staff_id);
      const { data: staffProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", staffIds);

      const formattedAssignedStaff = assignedStaffData
        .map((as) => {
          const profile = staffProfiles?.find((p) => p.id === as.staff_id);
          return profile ? { staff_id: as.staff_id, profiles: profile } : null;
        })
        .filter((as): as is AssignedStaff => as !== null);

      setAssignedStaff(formattedAssignedStaff);
    } else {
      setAssignedStaff([]);
    }

    // Fetch all contractors (users with contractor role)
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "contractor");

    if (roleData) {
      const contractorIds = roleData.map((r) => r.user_id);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", contractorIds);
      
      setContractors(profileData || []);
    }

    // Fetch assigned contractors for this claim
    const { data: assignedData } = await supabase
      .from("claim_contractors")
      .select("contractor_id")
      .eq("claim_id", claimId);

    if (assignedData && assignedData.length > 0) {
      const contractorIds = assignedData.map((ac) => ac.contractor_id);
      const { data: contractorProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", contractorIds);

      const formattedAssignedContractors = assignedData
        .map((ac) => {
          const profile = contractorProfiles?.find((p) => p.id === ac.contractor_id);
          return profile ? { contractor_id: ac.contractor_id, profiles: profile } : null;
        })
        .filter((ac): ac is AssignedContractor => ac !== null);

      setAssignedContractors(formattedAssignedContractors);
    } else {
      setAssignedContractors([]);
    }

    // Fetch referrers
    const { data: referrerData } = await supabase
      .from("referrers")
      .select("*")
      .eq("is_active", true)
      .order("name");

    setReferrers(referrerData || []);

    // Fetch mortgage companies
    const { data: mortgageData } = await supabase
      .from("mortgage_companies")
      .select("*")
      .eq("is_active", true)
      .order("name");

    setMortgageCompanies(mortgageData || []);
  };

  const handleAssignContractor = async () => {
    if (!selectedContractor) {
      toast.error("Please select a contractor");
      return;
    }

    // Check if already assigned
    const alreadyAssigned = assignedContractors.some(
      (ac) => ac.contractor_id === selectedContractor
    );

    if (alreadyAssigned) {
      toast.error("Contractor already assigned to this claim");
      return;
    }

    const { error } = await supabase
      .from("claim_contractors")
      .insert([{ claim_id: claimId, contractor_id: selectedContractor }]);

    if (error) {
      toast.error("Failed to assign contractor");
      return;
    }

    toast.success("Contractor assigned");
    setSelectedContractor("");
    fetchData();
  };

  const handleRemoveContractor = async (contractorId: string) => {
    const { error } = await supabase
      .from("claim_contractors")
      .delete()
      .eq("claim_id", claimId)
      .eq("contractor_id", contractorId);

    if (error) {
      toast.error("Failed to remove contractor");
      return;
    }

    toast.success("Contractor removed");
    fetchData();
  };

  const handleAssignStaff = async () => {
    if (!selectedStaff) {
      toast.error("Please select a staff member");
      return;
    }

    // Check if already assigned
    const alreadyAssigned = assignedStaff.some(
      (as) => as.staff_id === selectedStaff
    );

    if (alreadyAssigned) {
      toast.error("Staff member already assigned to this claim");
      return;
    }

    const { error } = await supabase
      .from("claim_staff")
      .insert([{ claim_id: claimId, staff_id: selectedStaff }]);

    if (error) {
      toast.error("Failed to assign staff member");
      return;
    }

    toast.success("Staff member assigned");
    setSelectedStaff("");
    fetchData();
  };

  const handleRemoveStaff = async (staffId: string) => {
    const { error } = await supabase
      .from("claim_staff")
      .delete()
      .eq("claim_id", claimId)
      .eq("staff_id", staffId);

    if (error) {
      toast.error("Failed to remove staff member");
      return;
    }

    toast.success("Staff member removed");
    fetchData();
  };

  const handleUpdateReferrer = async (referrerId: string) => {
    const actualReferrerId = referrerId === "none" ? null : referrerId;
    
    const { error } = await supabase
      .from("claims")
      .update({ referrer_id: actualReferrerId })
      .eq("id", claimId);

    if (error) {
      toast.error("Failed to update referrer");
      return;
    }

    setSelectedReferrer(referrerId);
    toast.success("Referrer updated");
  };

  const handleUpdateMortgageCompany = async (mortgageCompanyId: string) => {
    const actualMortgageCompanyId = mortgageCompanyId === "none" ? null : mortgageCompanyId;
    
    const { error } = await supabase
      .from("claims")
      .update({ mortgage_company_id: actualMortgageCompanyId })
      .eq("id", claimId);

    if (error) {
      toast.error("Failed to update mortgage company");
      return;
    }

    setSelectedMortgageCompany(mortgageCompanyId);
    toast.success("Mortgage company updated");
  };

  return (
    <div className="grid gap-6">
      {/* Staff Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Assigned Staff
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((staffMember) => (
                  <SelectItem key={staffMember.id} value={staffMember.id}>
                    {staffMember.full_name || staffMember.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssignStaff}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assign
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {assignedStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff assigned</p>
            ) : (
              assignedStaff.map((as) => (
                <Badge key={as.staff_id} variant="secondary" className="flex items-center gap-1">
                  {as.profiles.full_name || as.profiles.email}
                  <button
                    onClick={() => handleRemoveStaff(as.staff_id)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contractors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Assigned Contractors
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={selectedContractor} onValueChange={setSelectedContractor}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a contractor" />
              </SelectTrigger>
              <SelectContent>
                {contractors.map((contractor) => (
                  <SelectItem key={contractor.id} value={contractor.id}>
                    {contractor.full_name || contractor.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssignContractor}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assign
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {assignedContractors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contractors assigned</p>
            ) : (
              assignedContractors.map((ac) => (
                <Badge key={ac.contractor_id} variant="secondary" className="flex items-center gap-1">
                  {ac.profiles.full_name || ac.profiles.email}
                  <button
                    onClick={() => handleRemoveContractor(ac.contractor_id)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Referrer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Referrer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedReferrer} onValueChange={handleUpdateReferrer}>
            <SelectTrigger>
              <SelectValue placeholder="Select a referrer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {referrers.map((referrer) => (
                <SelectItem key={referrer.id} value={referrer.id}>
                  {referrer.name} {referrer.company && `(${referrer.company})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Mortgage Company */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Mortgage Company
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedMortgageCompany} onValueChange={handleUpdateMortgageCompany}>
            <SelectTrigger>
              <SelectValue placeholder="Select a mortgage company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {mortgageCompanies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name} {company.contact_name && `(${company.contact_name})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}