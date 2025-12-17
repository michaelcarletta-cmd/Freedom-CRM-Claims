import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LossTypesSettings } from "@/components/settings/LossTypesSettings";
import { AutomationsSettings } from "@/components/settings/AutomationsSettings";
import { CustomFieldsSettings } from "@/components/settings/CustomFieldsSettings";

import { ImportSettings } from "@/components/settings/ImportSettings";
import { UserManagementSettings } from "@/components/settings/UserManagementSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { AIKnowledgeBaseSettings } from "@/components/settings/AIKnowledgeBaseSettings";
import { QuickBooksSettings } from "@/components/settings/QuickBooksSettings";
import { BackupStatusSettings } from "@/components/settings/BackupStatusSettings";
import { CompanyBrandingSettings } from "@/components/settings/CompanyBrandingSettings";
import { MakeIntegrationSettings } from "@/components/settings/MakeIntegrationSettings";
import NotificationPreferencesSettings from "@/components/settings/NotificationPreferencesSettings";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { useQuery } from "@tanstack/react-query";

interface ClaimStatus {
  id: string;
  name: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

interface SortableStatusRowProps {
  status: ClaimStatus;
  onUpdateName: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

function SortableStatusRow({ status, onUpdateName, onDelete, onRefresh }: SortableStatusRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={status.name}
          onChange={(e) => onUpdateName(status.id, e.target.value)}
          onBlur={onRefresh}
          className="h-11 text-base"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full border-2"
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
          onClick={() => onDelete(status.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function Settings() {
  const [statuses, setStatuses] = useState<ClaimStatus[]>([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#3B82F6");
  const { toast } = useToast();

  // Check if current user is admin
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin-settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      
      return !!data;
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
    const trimmedName = newStatusName.trim();
    const nameToUse = trimmedName || "New Status";

    try {
      const maxOrder = Math.max(...statuses.map((s) => s.display_order), 0);

      console.log("Adding status:", {
        name: nameToUse,
        color: newStatusColor,
        display_order: maxOrder + 1,
      });

      const { data, error } = await supabase
        .from("claim_statuses")
        .insert({
          name: nameToUse,
          color: newStatusColor,
          display_order: maxOrder + 1,
        })
        .select();

      if (error) {
        console.error("Error adding status:", error);
        throw error;
      }

      console.log("Status added successfully:", data);

      toast({
        title: "Success",
        description: "Status added successfully",
      });

      setNewStatusName("");
      setNewStatusColor("#3B82F6");
      fetchStatuses();
    } catch (error: any) {
      console.error("Caught error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add status",
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = statuses.findIndex((s) => s.id === active.id);
    const newIndex = statuses.findIndex((s) => s.id === over.id);

    const newStatuses = arrayMove(statuses, oldIndex, newIndex);
    setStatuses(newStatuses);

    // Update display_order in database
    try {
      const updates = newStatuses.map((status, index) => ({
        id: status.id,
        display_order: index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("claim_statuses")
          .update({ display_order: update.display_order })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Status order updated",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      fetchStatuses(); // Revert on error
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your claim workflow and dropdown options</p>
      </div>

      <Tabs defaultValue="workflow" className="space-y-6">
        <TabsList className="flex flex-col md:flex-row md:flex-wrap h-auto w-full bg-muted/40 p-2 gap-1">
          <TabsTrigger value="profile" className="w-full md:w-auto justify-start text-base font-medium px-4">My Profile</TabsTrigger>
          <TabsTrigger value="notifications" className="w-full md:w-auto justify-start text-base font-medium px-4">Notifications</TabsTrigger>
          <TabsTrigger value="workflow" className="w-full md:w-auto justify-start text-base font-medium px-4">Workflow Management</TabsTrigger>
          <TabsTrigger value="users" className="w-full md:w-auto justify-start text-base font-medium px-4">User Management</TabsTrigger>
          <TabsTrigger value="automations" className="w-full md:w-auto justify-start text-base font-medium px-4">Automations</TabsTrigger>
          <TabsTrigger value="import" className="w-full md:w-auto justify-start text-base font-medium px-4">Import Data</TabsTrigger>
          <TabsTrigger value="ai-knowledge" className="w-full md:w-auto justify-start text-base font-medium px-4">AI Knowledge Base</TabsTrigger>
          <TabsTrigger value="integrations" className="w-full md:w-auto justify-start text-base font-medium px-4">Integrations</TabsTrigger>
          <TabsTrigger value="branding" className="w-full md:w-auto justify-start text-base font-medium px-4">Company Branding</TabsTrigger>
          <TabsTrigger value="organization" className="w-full md:w-auto justify-start text-base font-medium px-4">Organization</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="backup" className="w-full md:w-auto justify-start text-base font-medium px-4">Backup Status</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="w-full">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="notifications" className="w-full">
          <NotificationPreferencesSettings />
        </TabsContent>

        <TabsContent value="workflow" className="w-full space-y-6">
          {/* Claim Statuses */}
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
                  className="h-11 text-base"
                />
                <Input
                  type="color"
                  value={newStatusColor}
                  onChange={(e) => setNewStatusColor(e.target.value)}
                  className="w-24 h-11"
                />
                <Button onClick={addStatus} className="h-11">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Status
                </Button>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
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
                    <SortableContext
                      items={statuses.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {statuses.map((status) => (
                        <SortableStatusRow
                          key={status.id}
                          status={status}
                          onUpdateName={updateStatusName}
                          onDelete={deleteStatus}
                          onRefresh={fetchStatuses}
                        />
                      ))}
                    </SortableContext>
                  </TableBody>
                </Table>
              </DndContext>
            </CardContent>
          </Card>

          {/* Loss Types */}
          <LossTypesSettings />

          {/* Custom Fields */}
          <CustomFieldsSettings />
        </TabsContent>

        <TabsContent value="users" className="w-full">
          <UserManagementSettings />
        </TabsContent>

        <TabsContent value="automations" className="w-full">
          <AutomationsSettings />
        </TabsContent>

        <TabsContent value="import" className="w-full">
          <ImportSettings />
        </TabsContent>

        <TabsContent value="ai-knowledge" className="w-full">
          <AIKnowledgeBaseSettings />
        </TabsContent>

        <TabsContent value="integrations" className="w-full space-y-6">
          <MakeIntegrationSettings />
          <QuickBooksSettings />
        </TabsContent>

        <TabsContent value="branding" className="w-full">
          <CompanyBrandingSettings />
        </TabsContent>

        <TabsContent value="organization" className="w-full">
          <OrganizationSettings />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="backup" className="w-full">
            <BackupStatusSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
