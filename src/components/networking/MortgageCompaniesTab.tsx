import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Home, Mail, Phone, User, Plus, Search, Pencil, Globe, Key, Hash } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";
import { MaskedField } from "@/components/ui/masked-field";

interface MortgageCompany {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  phone_extension: string | null;
  email: string | null;
  is_active: boolean;
  loan_number: string | null;
  last_four_ssn: string | null;
  portal_username: string | null;
  portal_password: string | null;
  mortgage_site: string | null;
}

export const MortgageCompaniesTab = () => {
  const [companies, setCompanies] = useState<MortgageCompany[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<MortgageCompany[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<MortgageCompany | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    phone_extension: "",
    loan_number: "",
    last_four_ssn: "",
    portal_username: "",
    portal_password: "",
    mortgage_site: "",
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    const filtered = companies.filter((company) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        company.name.toLowerCase().includes(searchLower) ||
        company.contact_name?.toLowerCase().includes(searchLower) ||
        company.email?.toLowerCase().includes(searchLower) ||
        company.phone?.toLowerCase().includes(searchLower) ||
        company.loan_number?.toLowerCase().includes(searchLower)
      );
    });
    setFilteredCompanies(filtered);
  }, [companies, searchQuery]);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from("mortgage_companies")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to fetch mortgage companies");
      return;
    }

    setCompanies(data || []);
  };

  const handleOpenDialog = (company?: MortgageCompany) => {
    if (company) {
      setEditingCompany(company);
      setFormData({
        name: company.name,
        contact_name: company.contact_name || "",
        email: company.email || "",
        phone: company.phone || "",
        phone_extension: company.phone_extension || "",
        loan_number: company.loan_number || "",
        last_four_ssn: company.last_four_ssn || "",
        portal_username: company.portal_username || "",
        portal_password: company.portal_password || "",
        mortgage_site: company.mortgage_site || "",
      });
    } else {
      setEditingCompany(null);
      setFormData({ 
        name: "", 
        contact_name: "", 
        email: "", 
        phone: "", 
        phone_extension: "",
        loan_number: "",
        last_four_ssn: "",
        portal_username: "",
        portal_password: "",
        mortgage_site: "",
      });
    }
    setDialogOpen(true);
  };

  const handleSaveCompany = async () => {
    if (!formData.name.trim()) {
      toast.error("Company name is required");
      return;
    }

    const companyData = {
      name: formData.name,
      contact_name: formData.contact_name || null,
      phone: formData.phone || null,
      phone_extension: formData.phone_extension || null,
      email: formData.email || null,
      loan_number: formData.loan_number || null,
      last_four_ssn: formData.last_four_ssn || null,
      portal_username: formData.portal_username || null,
      portal_password: formData.portal_password || null,
      mortgage_site: formData.mortgage_site || null,
    };

    if (editingCompany) {
      const { error } = await supabase
        .from("mortgage_companies")
        .update(companyData)
        .eq("id", editingCompany.id);

      if (error) {
        toast.error("Failed to update company");
        return;
      }
      toast.success("Company updated");
    } else {
      const { error } = await supabase
        .from("mortgage_companies")
        .insert([companyData]);

      if (error) {
        toast.error("Failed to add company");
        return;
      }
      toast.success("Company added");
    }

    setDialogOpen(false);
    setEditingCompany(null);
    setFormData({ 
      name: "", 
      contact_name: "", 
      phone: "", 
      phone_extension: "", 
      email: "",
      loan_number: "",
      last_four_ssn: "",
      portal_username: "",
      portal_password: "",
      mortgage_site: "",
    });
    fetchCompanies();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <CardTitle>Mortgage Companies</CardTitle>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Company
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company name, contact, email, phone, or loan number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredCompanies.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {companies.length === 0 ? "No mortgage companies found" : "No companies match your search"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Company Name</TableHead>
                  <TableHead className="whitespace-nowrap">Contact Name</TableHead>
                  <TableHead className="whitespace-nowrap">Phone</TableHead>
                  <TableHead className="whitespace-nowrap">Loan #</TableHead>
                  <TableHead className="whitespace-nowrap">Portal Site</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Home className="h-4 w-4 text-muted-foreground" />
                        {company.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {company.contact_name ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {company.contact_name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {company.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {company.phone}
                          {company.phone_extension && ` ext ${company.phone_extension}`}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {company.loan_number ? (
                        <MaskedField
                          value={company.loan_number}
                          fieldName="loan_number"
                          recordType="mortgage_company"
                          recordId={company.id}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {company.mortgage_site ? (
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={company.mortgage_site.startsWith('http') ? company.mortgage_site : `https://${company.mortgage_site}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate max-w-[150px]"
                          >
                            {company.mortgage_site}
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(company)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Edit" : "Add"} Mortgage Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">Company Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter company name"
                  />
                </div>
                <div>
                  <Label>Contact Name</Label>
                  <Input
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="Enter contact name"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label>Phone</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                      placeholder="123-456-7890"
                    />
                  </div>
                  <div>
                    <Label>Ext</Label>
                    <Input
                      value={formData.phone_extension}
                      onChange={(e) => setFormData({ ...formData, phone_extension: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      placeholder="1234"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Loan Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">Loan Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Loan Number
                  </Label>
                  <Input
                    value={formData.loan_number}
                    onChange={(e) => setFormData({ ...formData, loan_number: e.target.value })}
                    placeholder="Enter loan number"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Last 4 of SSN
                  </Label>
                  <Input
                    value={formData.last_four_ssn}
                    onChange={(e) => setFormData({ ...formData, last_four_ssn: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="1234"
                    maxLength={4}
                  />
                </div>
              </div>
            </div>

            {/* Portal Access Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">Portal Access</h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Mortgage Portal Site
                  </Label>
                  <Input
                    value={formData.mortgage_site}
                    onChange={(e) => setFormData({ ...formData, mortgage_site: e.target.value })}
                    placeholder="e.g., insuranceclaimcheck.com or myinsuranceportal.com"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Portal Username</Label>
                    <Input
                      value={formData.portal_username}
                      onChange={(e) => setFormData({ ...formData, portal_username: e.target.value })}
                      placeholder="Enter username"
                    />
                  </div>
                  <div>
                    <Label>Portal Password</Label>
                    <Input
                      type="password"
                      value={formData.portal_password}
                      onChange={(e) => setFormData({ ...formData, portal_password: e.target.value })}
                      placeholder="Enter password"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button onClick={handleSaveCompany} className="w-full">
              {editingCompany ? "Save Changes" : "Add Company"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
