import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface InsuranceCompany {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface LossType {
  id: string;
  name: string;
}

interface Referrer {
  id: string;
  name: string;
  company: string | null;
}

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

export function NewClaimDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insuranceCompanies, setInsuranceCompanies] = useState<InsuranceCompany[]>([]);
  const [lossTypes, setLossTypes] = useState<LossType[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    // Client Information
    policyholderName: "",
    policyholderPhone: "",
    policyholderEmail: "",
    policyholderStreet: "",
    policyholderCity: "",
    policyholderState: "",
    policyholderZip: "",
    
    // Claim Information
    claimNumber: "",
    policyNumber: "",
    insuranceCompanyId: "",
    insurancePhone: "",
    insuranceEmail: "",
    lossTypeId: "",
    lossDate: "",
    lossDescription: "",
    referrerId: "",
  });

  useEffect(() => {
    if (open) {
      fetchDropdownData();
    }
  }, [open]);

  const fetchDropdownData = async () => {
    try {
      const [insuranceRes, lossTypesRes, referrersRes, clientsRes] = await Promise.all([
        supabase.from("insurance_companies").select("id, name, phone, email").eq("is_active", true).order("name"),
        supabase.from("loss_types").select("id, name").eq("is_active", true).order("name"),
        supabase.from("referrers").select("id, name, company").eq("is_active", true).order("name"),
        supabase.from("clients").select("id, name, email, phone, street, city, state, zip_code").order("name"),
      ]);

      if (insuranceRes.error) throw insuranceRes.error;
      if (lossTypesRes.error) throw lossTypesRes.error;
      if (referrersRes.error) throw referrersRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setInsuranceCompanies(insuranceRes.data || []);
      setLossTypes(lossTypesRes.data || []);
      setReferrers(referrersRes.data || []);
      setClients(clientsRes.data || []);
    } catch (error: any) {
      console.error("Error fetching dropdown data:", error);
      toast({
        title: "Error",
        description: "Failed to load form data",
        variant: "destructive",
      });
    }
  };

  const handleInsuranceCompanyChange = (companyId: string) => {
    const selectedCompany = insuranceCompanies.find((c) => c.id === companyId);
    setFormData({
      ...formData,
      insuranceCompanyId: companyId,
      insurancePhone: selectedCompany?.phone || "",
      insuranceEmail: selectedCompany?.email || "",
    });
  };

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    if (clientId === "new") {
      // Clear fields for new client
      setFormData({
        ...formData,
        policyholderName: "",
        policyholderPhone: "",
        policyholderEmail: "",
        policyholderStreet: "",
        policyholderCity: "",
        policyholderState: "",
        policyholderZip: "",
      });
    } else {
      // Populate fields from selected client
      const selectedClient = clients.find((c) => c.id === clientId);
      if (selectedClient) {
        setFormData({
          ...formData,
          policyholderName: selectedClient.name,
          policyholderPhone: selectedClient.phone || "",
          policyholderEmail: selectedClient.email || "",
          policyholderStreet: selectedClient.street || "",
          policyholderCity: selectedClient.city || "",
          policyholderState: selectedClient.state || "",
          policyholderZip: selectedClient.zip_code || "",
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Determine client_id
      let clientId = null;
      
      if (selectedClientId && selectedClientId !== "new") {
        // Use existing client
        clientId = selectedClientId;
      } else {
        // Create new client or find by email
        if (formData.policyholderEmail) {
          const { data: existingClient } = await supabase
            .from("clients")
            .select("id")
            .eq("email", formData.policyholderEmail)
            .single();
          
          if (existingClient) {
            clientId = existingClient.id;
          }
        }
        
        // If still no client, create a new one
        if (!clientId) {
          let userId: string | null = null;

          // Create user account if email is provided
          if (formData.policyholderEmail) {
            const tempPassword = Math.random().toString(36).slice(-8) + "A1!";
            
            const { data: authData, error: authError } = await supabase.auth.signUp({
              email: formData.policyholderEmail,
              password: tempPassword,
              options: {
                data: {
                  full_name: formData.policyholderName,
                  role: 'client',
                },
              },
            });

            if (!authError && authData.user) {
              userId = authData.user.id;

              // Update profile with phone
              if (formData.policyholderPhone) {
                await supabase
                  .from("profiles")
                  .update({ phone: formData.policyholderPhone })
                  .eq("id", authData.user.id);
              }
            }
          }

          const { data: newClient, error: clientError } = await supabase
            .from("clients")
            .insert({
              name: formData.policyholderName,
              email: formData.policyholderEmail || null,
              phone: formData.policyholderPhone || null,
              street: formData.policyholderStreet || null,
              city: formData.policyholderCity || null,
              state: formData.policyholderState || null,
              zip_code: formData.policyholderZip || null,
              user_id: userId, // Link client to auth user
            })
            .select()
            .single();

          if (clientError) throw clientError;
          clientId = newClient.id;
        }
      }

      // Build policyholder address from separate fields
      const addressParts = [
        formData.policyholderStreet,
        formData.policyholderCity,
        formData.policyholderState,
        formData.policyholderZip,
      ].filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : null;

      // Now create the claim with the client_id
      const { data, error } = await supabase
        .from("claims")
        .insert({
          claim_number: formData.claimNumber || null,
          policy_number: formData.policyNumber || null,
          policyholder_name: formData.policyholderName || null,
          policyholder_phone: formData.policyholderPhone || null,
          policyholder_email: formData.policyholderEmail || null,
          policyholder_address: fullAddress,
          insurance_company_id: formData.insuranceCompanyId || null,
          insurance_phone: formData.insurancePhone || null,
          insurance_email: formData.insuranceEmail || null,
          loss_type_id: formData.lossTypeId || null,
          loss_date: formData.lossDate || null,
          loss_description: formData.lossDescription || null,
          referrer_id: formData.referrerId || null,
          client_id: clientId,
          status: "open",
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-assign staff member who created the claim
      if (data?.id) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id);
          
          const isStaff = roles?.some(r => r.role === "staff");
          
          // Assign the staff member to the claim they just created
          if (isStaff) {
            await supabase
              .from("claim_staff")
              .insert({ claim_id: data.id, staff_id: user.id });
          }
        }
      }

      toast({
        title: "Success",
        description: "Claim created successfully",
      });

      setOpen(false);
      setSelectedClientId("");
      setFormData({
        policyholderName: "",
        policyholderPhone: "",
        policyholderEmail: "",
        policyholderStreet: "",
        policyholderCity: "",
        policyholderState: "",
        policyholderZip: "",
        claimNumber: "",
        policyNumber: "",
        insuranceCompanyId: "",
        insurancePhone: "",
        insuranceEmail: "",
        lossTypeId: "",
        lossDate: "",
        lossDescription: "",
        referrerId: "",
      });

      // Navigate to the new claim
      if (data?.id) {
        navigate(`/claims/${data.id}`);
      }
    } catch (error: any) {
      console.error("Error creating claim:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create claim",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          New Claim
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Create New Claim</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client Information Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Client Information
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientSelect">Select Existing Client (Optional)</Label>
                <Select value={selectedClientId} onValueChange={handleClientChange}>
                  <SelectTrigger id="clientSelect">
                    <SelectValue placeholder="Select a client or create new" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create New Client</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} {client.email && `(${client.email})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="policyholderName">Full Name</Label>
                <Input
                  id="policyholderName"
                  value={formData.policyholderName}
                  onChange={(e) => setFormData({ ...formData, policyholderName: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyholderPhone">Phone Number</Label>
                <Input
                  id="policyholderPhone"
                  type="tel"
                  value={formData.policyholderPhone}
                  onChange={(e) => setFormData({ ...formData, policyholderPhone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="policyholderEmail">Email</Label>
                <Input
                  id="policyholderEmail"
                  type="email"
                  value={formData.policyholderEmail}
                  onChange={(e) => setFormData({ ...formData, policyholderEmail: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="policyholderStreet">Street Address</Label>
                <Input
                  id="policyholderStreet"
                  value={formData.policyholderStreet}
                  onChange={(e) => setFormData({ ...formData, policyholderStreet: e.target.value })}
                  placeholder="123 Main St"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyholderCity">City</Label>
                <Input
                  id="policyholderCity"
                  value={formData.policyholderCity}
                  onChange={(e) => setFormData({ ...formData, policyholderCity: e.target.value })}
                  placeholder="Miami"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyholderState">State</Label>
                <Input
                  id="policyholderState"
                  value={formData.policyholderState}
                  onChange={(e) => setFormData({ ...formData, policyholderState: e.target.value })}
                  placeholder="FL"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="policyholderZip">ZIP Code</Label>
                <Input
                  id="policyholderZip"
                  value={formData.policyholderZip}
                  onChange={(e) => setFormData({ ...formData, policyholderZip: e.target.value })}
                  placeholder="33101"
                />
              </div>
            </div>
          </div>

          {/* Claim Information Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Claim Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="claimNumber">Claim Number</Label>
                <Input
                  id="claimNumber"
                  value={formData.claimNumber}
                  onChange={(e) => setFormData({ ...formData, claimNumber: e.target.value })}
                  placeholder="CLM-2024-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyNumber">Policy Number</Label>
                <Input
                  id="policyNumber"
                  value={formData.policyNumber}
                  onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                  placeholder="POL-123456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insuranceCompany">Insurance Company</Label>
                <Select
                  value={formData.insuranceCompanyId}
                  onValueChange={handleInsuranceCompanyChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select insurance company" />
                  </SelectTrigger>
                  <SelectContent>
                    {insuranceCompanies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lossType">Type of Loss</Label>
                <Select
                  value={formData.lossTypeId}
                  onValueChange={(value) => setFormData({ ...formData, lossTypeId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select loss type" />
                  </SelectTrigger>
                  <SelectContent>
                    {lossTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lossDate">Date of Loss</Label>
                <Input
                  id="lossDate"
                  type="date"
                  value={formData.lossDate}
                  onChange={(e) => setFormData({ ...formData, lossDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="referrer">Referrer</Label>
                <Select
                  value={formData.referrerId}
                  onValueChange={(value) => setFormData({ ...formData, referrerId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select referrer" />
                  </SelectTrigger>
                  <SelectContent>
                    {referrers.map((referrer) => (
                      <SelectItem key={referrer.id} value={referrer.id}>
                        {referrer.name} {referrer.company && `(${referrer.company})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="lossDescription">Loss Description</Label>
                <Textarea
                  id="lossDescription"
                  value={formData.lossDescription}
                  onChange={(e) => setFormData({ ...formData, lossDescription: e.target.value })}
                  placeholder="Describe the incident..."
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Claim"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
