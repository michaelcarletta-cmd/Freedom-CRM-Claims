import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileSignature, Plus, Loader2, Mail, Check, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SignatureRequestsProps {
  claimId: string;
  claim: any;
}

export function SignatureRequests({ claimId, claim }: SignatureRequestsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [signers, setSigners] = useState([
    { name: claim.policyholder_name, email: claim.policyholder_email || "", type: "policyholder", order: 1 }
  ]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  const { data: templates } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ["signature-requests", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select(`
          *,
          signature_signers(*)
        `)
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("No template selected");

      // Generate document from template
      const { data: docData, error: docError } = await supabase.functions.invoke(
        "generate-document",
        { body: { templateId: selectedTemplate.id, claimId } }
      );
      if (docError) throw docError;

      // Upload to storage
      const fileName = `signatures/${claimId}/${Date.now()}-${docData.fileName}`;
      const blob = new Blob([new Uint8Array(docData.content.data)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      
      const { error: uploadError } = await supabase.storage
        .from("claim-files")
        .upload(fileName, blob);
      if (uploadError) throw uploadError;

      // Create signature request
      const { data: request, error: requestError } = await supabase
        .from("signature_requests")
        .insert({
          claim_id: claimId,
          document_name: docData.fileName,
          document_path: fileName,
        })
        .select()
        .single();
      if (requestError) throw requestError;

      // Create signers
      const signersData = signers.map((s) => ({
        signature_request_id: request.id,
        signer_name: s.name,
        signer_email: s.email,
        signer_type: s.type,
        signing_order: s.order,
      }));

      const { error: signersError } = await supabase
        .from("signature_signers")
        .insert(signersData);
      if (signersError) throw signersError;

      // Send notification emails
      await supabase.functions.invoke("send-signature-request", {
        body: { requestId: request.id },
      });

      return request;
    },
    onSuccess: () => {
      toast({ title: "Signature request created and emails sent" });
      setIsCreateOpen(false);
      setSelectedTemplate(null);
      setSigners([{ name: claim.policyholder_name, email: claim.policyholder_email || "", type: "policyholder", order: 1 }]);
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create request", description: error.message, variant: "destructive" });
    },
  });

  const addSigner = () => {
    setSigners([...signers, { name: "", email: "", type: "other", order: signers.length + 1 }]);
  };

  const updateSigner = (index: number, field: string, value: string) => {
    const updated = [...signers];
    updated[index] = { ...updated[index], [field]: value };
    setSigners(updated);
  };

  const removeSigner = (index: number) => {
    setSigners(signers.filter((_, i) => i !== index));
  };

  const deleteRequestMutation = useMutation({
    mutationFn: async (request: any) => {
      // Delete document from storage
      const { error: storageError } = await supabase.storage
        .from("claim-files")
        .remove([request.document_path]);
      if (storageError) console.error("Storage deletion error:", storageError);

      // Delete signature request (will cascade delete signers)
      const { error } = await supabase
        .from("signature_requests")
        .delete()
        .eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Signature request deleted" });
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <Check className="w-4 h-4 text-green-600" />;
      case "in_progress": return <Clock className="w-4 h-4 text-yellow-600" />;
      case "declined": return <X className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      in_progress: "secondary",
      declined: "destructive",
      pending: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace("_", " ")}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Signature Requests</h3>
          <p className="text-sm text-muted-foreground">
            Send documents for electronic signature
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Request Signature
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Signature Request</DialogTitle>
              <DialogDescription>
                Select a template and add signers
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Document Template</Label>
                <Select
                  value={selectedTemplate?.id}
                  onValueChange={(id) =>
                    setSelectedTemplate(templates?.find((t) => t.id === id))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Signers (in order)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addSigner}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Signer
                  </Button>
                </div>
                {signers.map((signer, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <Input
                        placeholder="Name"
                        value={signer.name}
                        onChange={(e) => updateSigner(index, "name", e.target.value)}
                      />
                      <Input
                        type="email"
                        placeholder="Email"
                        value={signer.email}
                        onChange={(e) => updateSigner(index, "email", e.target.value)}
                      />
                      <Select
                        value={signer.type}
                        onValueChange={(value) => updateSigner(index, "type", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="policyholder">Policyholder</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {signers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSigner(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createRequestMutation.mutate()}
                disabled={!selectedTemplate || signers.some(s => !s.name || !s.email) || createRequestMutation.isPending}
              >
                {createRequestMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send for Signature
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : requests && requests.length > 0 ? (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileSignature className="w-5 h-5" />
                    <div>
                      <CardTitle className="text-base">{request.document_name}</CardTitle>
                      <CardDescription>
                        Created {new Date(request.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(request.status)}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRequestMutation.mutate(request)}
                      disabled={deleteRequestMutation.isPending}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Signers:</p>
                  <div className="space-y-1">
                    {request.signature_signers?.sort((a, b) => a.signing_order - b.signing_order).map((signer) => (
                      <div key={signer.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(signer.status)}
                          <span>{signer.signer_name}</span>
                          <span className="text-muted-foreground">({signer.signer_email})</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {signer.status === "signed" ? `Signed ${new Date(signer.signed_at!).toLocaleDateString()}` : signer.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <FileSignature className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No signature requests yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
