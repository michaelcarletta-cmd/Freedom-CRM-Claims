import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface ClaimStatus {
  id: string;
  name: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

export default function Settings() {
  const [statuses, setStatuses] = useState<ClaimStatus[]>([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#3B82F6");
  const { toast } = useToast();

  useEffect(() => {
    fetchStatuses();
  }, []);

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from("claim_statuses")
        .select("*")
        .order("display_order");

      if (error) throw error;
      setStatuses(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addStatus = async () => {
    if (!newStatusName.trim()) return;

    try {
      const maxOrder = Math.max(...statuses.map(s => s.display_order), 0);
      
      const { error } = await supabase
        .from("claim_statuses")
        .insert({
          name: newStatusName,
          color: newStatusColor,
          display_order: maxOrder + 1,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Status added successfully",
      });

      setNewStatusName("");
      setNewStatusColor("#3B82F6");
      fetchStatuses();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteStatus = async (id: string) => {
    try {
      const { error } = await supabase
        .from("claim_statuses")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Status deleted successfully",
      });

      fetchStatuses();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateStatusName = async (id: string, newName: string) => {
    try {
      const { error } = await supabase
        .from("claim_statuses")
        .update({ name: newName })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Status updated successfully",
      });

      fetchStatuses();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your claim workflow statuses</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Claim Statuses</CardTitle>
          <CardDescription>
            Customize the status options available for claims
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Status name"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStatus()}
            />
            <Input
              type="color"
              value={newStatusColor}
              onChange={(e) => setNewStatusColor(e.target.value)}
              className="w-20"
            />
            <Button onClick={addStatus}>
              <Plus className="h-4 w-4 mr-2" />
              Add Status
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Status Name</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses.map((status) => (
                <TableRow key={status.id}>
                  <TableCell>
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={status.name}
                      onChange={(e) => updateStatusName(status.id, e.target.value)}
                      onBlur={() => fetchStatuses()}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {status.color}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteStatus(status.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
