import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Mail, Phone, Edit, Search, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NewClientDialog } from "@/components/NewClientDialog";
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
}

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setClients(data || []);
      setFilteredClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    const filtered = clients.filter((client) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        client.name.toLowerCase().includes(searchLower) ||
        client.email?.toLowerCase().includes(searchLower) ||
        client.phone?.toLowerCase().includes(searchLower) ||
        client.city?.toLowerCase().includes(searchLower) ||
        client.state?.toLowerCase().includes(searchLower)
      );
    });
    setFilteredClients(filtered);
  }, [clients, searchQuery]);

  const handleEditClick = (client: Client, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedClient(client);
    setIsEditDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading clients...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your client relationships</p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90"
          onClick={() => setIsNewDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No clients yet</p>
            <Button onClick={() => setIsNewDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients by name, email, phone, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredClients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No clients match your search
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredClients.map((client) => (
                <Card key={client.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg truncate">{client.name}</h3>
                          {client.email && (
                            <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" />
                              <span className="truncate">{client.email}</span>
                            </div>
                          )}
                          {client.phone && (
                            <div className="hidden lg:flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              <span>{client.phone}</span>
                            </div>
                          )}
                          {(client.city || client.state) && (
                            <div className="hidden xl:flex items-center gap-1.5 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate">
                                {[client.city, client.state].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="md:hidden mt-1 space-y-1">
                          {client.email && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" />
                              <span className="truncate">{client.email}</span>
                            </div>
                          )}
                          {client.phone && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              <span>{client.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleEditClick(client, e)}
                        >
                          <Edit className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">Edit</span>
                        </Button>
                        <Button variant="default" size="sm" asChild>
                          <Link to={`/clients/${client.id}`}>View</Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <NewClientDialog
        isOpen={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
        onClientCreated={fetchClients}
      />

      <EditClientDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setSelectedClient(null);
        }}
        client={selectedClient}
        onClientUpdated={fetchClients}
      />
    </div>
  );
};

export default Clients;
