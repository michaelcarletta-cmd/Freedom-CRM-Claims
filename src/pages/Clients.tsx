import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Mail, Phone } from "lucide-react";

const mockClients = [
  { id: "1", name: "John Smith", email: "john.smith@email.com", phone: "(555) 123-4567", activeClaims: 1 },
  { id: "2", name: "Sarah Johnson", email: "sarah.j@email.com", phone: "(555) 234-5678", activeClaims: 2 },
  { id: "3", name: "Michael Brown", email: "m.brown@email.com", phone: "(555) 345-6789", activeClaims: 1 },
  { id: "4", name: "Emily Davis", email: "emily.davis@email.com", phone: "(555) 456-7890", activeClaims: 1 },
];

const Clients = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your client relationships</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          New Client
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockClients.map((client) => (
          <Card key={client.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">{client.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{client.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{client.phone}</span>
              </div>
              <div className="pt-2 border-t border-border">
                <span className="text-sm font-medium text-foreground">
                  {client.activeClaims} Active {client.activeClaims === 1 ? "Claim" : "Claims"}
                </span>
              </div>
              <Button variant="outline" className="w-full mt-2">View Profile</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Clients;
