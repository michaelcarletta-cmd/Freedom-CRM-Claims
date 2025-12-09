import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link2, RefreshCw, Unlink, Plus, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface ClaimExternalSyncProps {
  claimId: string;
}

export function ClaimExternalSync({ claimId }: ClaimExternalSyncProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [includeAccounting, setIncludeAccounting] = useState(true);
  const queryClient = useQueryClient();

  const { data: linkedClaims, isLoading } = useQuery({
    queryKey: ['linked-claims', claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linked_claims')
        .select('*')
        .eq('claim_id', claimId);
      
      if (error) throw error;
      return data;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async ({ targetUrl, name, includeAcc }: { targetUrl: string; name: string; includeAcc: boolean }) => {
      const { data, error } = await supabase.functions.invoke('sync-claim-to-external', {
        body: {
          claim_id: claimId,
          target_instance_url: targetUrl,
          instance_name: name,
          include_accounting: includeAcc,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Claim synced successfully');
      queryClient.invalidateQueries({ queryKey: ['linked-claims', claimId] });
      setIsLinkDialogOpen(false);
      setInstanceUrl("");
      setInstanceName("");
    },
    onError: (error: Error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('linked_claims')
        .delete()
        .eq('id', linkId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Link removed');
      queryClient.invalidateQueries({ queryKey: ['linked-claims', claimId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to unlink: ${error.message}`);
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async (link: { external_instance_url: string; instance_name: string }) => {
      const { data, error } = await supabase.functions.invoke('sync-claim-to-external', {
        body: {
          claim_id: claimId,
          target_instance_url: link.external_instance_url,
          instance_name: link.instance_name,
          include_accounting: true,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Re-synced successfully');
      queryClient.invalidateQueries({ queryKey: ['linked-claims', claimId] });
    },
    onError: (error: Error) => {
      toast.error(`Re-sync failed: ${error.message}`);
    },
  });

  const handleSync = () => {
    if (!instanceUrl.trim()) {
      toast.error('Please enter the instance URL');
      return;
    }
    if (!instanceName.trim()) {
      toast.error('Please enter an instance name');
      return;
    }

    syncMutation.mutate({
      targetUrl: instanceUrl.trim(),
      name: instanceName.trim(),
      includeAcc: includeAccounting,
    });
  };

  const getSyncStatusBadge = (status: string | null) => {
    switch (status) {
      case 'synced':
        return <Badge variant="default" className="bg-green-500">Synced</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              External Instance Sync
            </CardTitle>
            <CardDescription>
              Link this claim to contractor instances for two-way sync
            </CardDescription>
          </div>
          <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Link Instance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link to External Instance</DialogTitle>
                <DialogDescription>
                  Enter the Supabase URL of the external instance to sync this claim with.
                  Both instances must have the same CLAIM_SYNC_SECRET configured.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="instanceName">Instance Name</Label>
                  <Input
                    id="instanceName"
                    placeholder="e.g., Condition One Commercial"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instanceUrl">Supabase URL</Label>
                  <Input
                    id="instanceUrl"
                    placeholder="https://xxxxx.supabase.co"
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The Supabase project URL of the external instance
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeAccounting"
                    checked={includeAccounting}
                    onCheckedChange={(checked) => setIncludeAccounting(checked as boolean)}
                  />
                  <Label htmlFor="includeAccounting" className="text-sm">
                    Include accounting data (settlements, checks, expenses)
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSync} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Link & Sync
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading linked instances...</p>
        ) : linkedClaims && linkedClaims.length > 0 ? (
          <div className="space-y-3">
            {linkedClaims.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{link.instance_name}</span>
                    {getSyncStatusBadge(link.sync_status)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {link.external_instance_url}
                  </p>
                  {link.last_synced_at && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {format(new Date(link.last_synced_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resyncMutation.mutate({
                      external_instance_url: link.external_instance_url,
                      instance_name: link.instance_name,
                    })}
                    disabled={resyncMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${resyncMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unlinkMutation.mutate(link.id)}
                    disabled={unlinkMutation.isPending}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No linked instances. Click "Link Instance" to sync this claim with an external instance.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
