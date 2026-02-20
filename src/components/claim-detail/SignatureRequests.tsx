import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileSignature,
  Loader2,
  Mail,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { FieldPlacementEditor } from "./FieldPlacementEditor";

type SourceType = "uploaded_pdf" | "generated";

interface SignatureRequestsProps {
  claimId: string;
  claim: any;
}

interface SignerDraft {
  name: string;
  email: string;
  type: string;
}

interface DesignerField {
  id: string;
  type: "signature" | "date" | "text" | "checkbox";
  x: number;
  y: number;
  width?: number;
  height?: number;
  w?: number;
  h?: number;
  label?: string;
  required?: boolean;
  signerIndex?: number;
  page?: number;
  pageWidth?: number;
  pageHeight?: number;
  [key: string]: unknown;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function getTemplateFields(template: any | null | undefined): DesignerField[] {
  if (!template?.field_data || !Array.isArray(template.field_data)) {
    return [];
  }
  return template.field_data as DesignerField[];
}

export function SignatureRequests({ claimId, claim }: SignatureRequestsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const [sourceType, setSourceType] = useState<SourceType>("generated");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedFieldTemplateId, setSelectedFieldTemplateId] = useState<string>("");

  const [uploadedPdfFile, setUploadedPdfFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string | null>(null);

  const [placedFields, setPlacedFields] = useState<DesignerField[]>([]);
  const [templateDefaultFields, setTemplateDefaultFields] = useState<DesignerField[]>([]);
  const [templateDefaultsVersion, setTemplateDefaultsVersion] = useState<string>("none");

  const [signers, setSigners] = useState<SignerDraft[]>([
    {
      name: claim.policyholder_name || "",
      email: claim.policyholder_email || "",
      type: "policyholder",
    },
  ]);

  const { data: templates } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: fieldTemplates } = useQuery({
    queryKey: ["signature-field-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_field_templates")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ["signature-requests", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select(`
          id,
          claim_id,
          source_type,
          draft_pdf_path,
          final_pdf_path,
          status,
          created_at,
          metadata,
          signature_signers (
            id,
            name,
            email,
            signing_order,
            status,
            signed_at
          )
        `)
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (sourceType !== "uploaded_pdf") {
      if (uploadedPreviewUrl) {
        URL.revokeObjectURL(uploadedPreviewUrl);
      }
      setUploadedPreviewUrl(null);
      setUploadedPdfFile(null);
      return;
    }
  }, [sourceType]);

  useEffect(() => {
    const setupTemplatePreview = async () => {
      if (sourceType !== "generated" || !selectedTemplate) {
        setTemplatePreviewUrl(null);
        return;
      }

      const templateFileName = String(selectedTemplate.file_name || "").toLowerCase();
      const isPdfTemplate = templateFileName.endsWith(".pdf");

      if (!isPdfTemplate) {
        setTemplatePreviewUrl(null);
        return;
      }

      const { data: signedUrlData, error } = await supabase.storage
        .from("document-templates")
        .createSignedUrl(selectedTemplate.file_path, 3600);

      if (error || !signedUrlData?.signedUrl) {
        toast({
          title: "Unable to load template preview",
          description: error?.message || "Signed URL generation failed",
          variant: "destructive",
        });
        setTemplatePreviewUrl(null);
        return;
      }

      setTemplatePreviewUrl(signedUrlData.signedUrl);
    };

    setupTemplatePreview();
  }, [sourceType, selectedTemplate, toast]);

  useEffect(() => {
    if (sourceType !== "generated" || !selectedTemplate || !fieldTemplates?.length) {
      return;
    }

    const selectedName = String(selectedTemplate.name || "").trim().toLowerCase();
    const matchingTemplate = fieldTemplates.find(
      (fieldTemplate) => String(fieldTemplate.name || "").trim().toLowerCase() === selectedName,
    );

    if (!matchingTemplate) {
      return;
    }

    setSelectedFieldTemplateId(matchingTemplate.id);
    const defaults = getTemplateFields(matchingTemplate);
    setTemplateDefaultFields(defaults);
    setTemplateDefaultsVersion(`${matchingTemplate.id}-${Date.now()}`);
    setPlacedFields(defaults);
  }, [sourceType, selectedTemplate, fieldTemplates]);

  const previewUrl = sourceType === "uploaded_pdf" ? uploadedPreviewUrl : templatePreviewUrl;
  const effectiveFields = placedFields.length > 0 ? placedFields : templateDefaultFields;

  const canProceedFromStep1 = useMemo(() => {
    if (sourceType === "uploaded_pdf") {
      return !!uploadedPdfFile;
    }
    return !!selectedTemplate;
  }, [sourceType, uploadedPdfFile, selectedTemplate]);

  const applyFieldTemplate = (templateId: string) => {
    setSelectedFieldTemplateId(templateId);
    const picked = fieldTemplates?.find((template) => template.id === templateId);
    const defaults = getTemplateFields(picked);
    setTemplateDefaultFields(defaults);
    setTemplateDefaultsVersion(`${templateId}-${Date.now()}`);
    setPlacedFields(defaults);
  };

  const addSigner = () => {
    setSigners((prev) => [...prev, { name: "", email: "", type: "other" }]);
  };

  const updateSigner = (index: number, field: keyof SignerDraft, value: string) => {
    setSigners((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeSigner = (index: number) => {
    setSigners((prev) => prev.filter((_, idx) => idx !== index));
  };

  const resetDialogState = () => {
    setCurrentStep(1);
    setSourceType("generated");
    setSelectedTemplate(null);
    setSelectedFieldTemplateId("");
    setPlacedFields([]);
    setTemplateDefaultFields([]);
    setTemplateDefaultsVersion(`reset-${Date.now()}`);
    setTemplatePreviewUrl(null);
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    setUploadedPreviewUrl(null);
    setUploadedPdfFile(null);
    setSigners([
      {
        name: claim.policyholder_name || "",
        email: claim.policyholder_email || "",
        type: "policyholder",
      },
    ]);
  };

  const createAndSendMutation = useMutation({
    mutationFn: async () => {
      if (sourceType === "uploaded_pdf" && !uploadedPdfFile) {
        throw new Error("Please upload a PDF first");
      }
      if (sourceType === "generated" && !selectedTemplate) {
        throw new Error("Please select a template");
      }
      if (signers.some((signer) => !signer.name.trim() || !signer.email.trim())) {
        throw new Error("All signers must have name and email");
      }
      if (effectiveFields.length === 0) {
        throw new Error("Add at least one signature field before sending");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const requestDocumentName = sourceType === "uploaded_pdf"
        ? uploadedPdfFile?.name || "Uploaded PDF"
        : selectedTemplate?.name || "Generated Contract";

      const requestMetadata: Record<string, unknown> = {
        field_template_id: selectedFieldTemplateId || null,
      };
      if (sourceType === "generated") {
        requestMetadata.template_id = selectedTemplate.id;
        requestMetadata.template_name = selectedTemplate.name;
      }

      const { data: request, error: requestError } = await supabase
        .from("signature_requests")
        .insert({
          claim_id: claimId,
          source_type: sourceType,
          status: "draft",
          draft_pdf_path: null,
          final_pdf_path: null,
          created_by: user?.id ?? null,
          document_name: requestDocumentName,
          document_path: null,
          metadata: requestMetadata as any,
        } as any)
        .select("id, claim_id")
        .single();

      if (requestError) throw requestError;

      if (sourceType === "uploaded_pdf" && uploadedPdfFile) {
        const draftPath = `drafts/${claimId}/${request.id}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("claim-files")
          .upload(draftPath, uploadedPdfFile, {
            upsert: true,
            contentType: "application/pdf",
          });
        if (uploadError) throw uploadError;

        const { error: updateDraftError } = await supabase
          .from("signature_requests")
          .update({
            draft_pdf_path: draftPath,
            document_path: draftPath,
          } as any)
          .eq("id", request.id);
        if (updateDraftError) throw updateDraftError;
      }

      const signerRows = signers.map((signer, index) => ({
        request_id: request.id,
        name: signer.name.trim(),
        email: signer.email.trim(),
        signing_order: index + 1,
        status: "pending",
        signer_type: signer.type || "other",
      }));

      const { data: createdSigners, error: signersError } = await supabase
        .from("signature_signers")
        .insert(signerRows as any)
        .select("id, signing_order");
      if (signersError) throw signersError;

      const signerIdByOrder = new Map<number, string>();
      (createdSigners || []).forEach((signer: any) => {
        signerIdByOrder.set(Number(signer.signing_order), signer.id);
      });

      const fieldRows = effectiveFields.map((field, index) => {
        const signerIndex = Number(field.signerIndex ?? 0);
        const assignedSignerId = signerIdByOrder.get(signerIndex + 1) || createdSigners?.[0]?.id;
        if (!assignedSignerId) {
          throw new Error("Unable to assign one or more fields to a signer");
        }

        const pageWidth = Number(field.pageWidth ?? 600) || 600;
        const pageHeight = Number(field.pageHeight ?? 800) || 800;
        const rawX = Number(field.x ?? 0);
        const rawY = Number(field.y ?? 0);
        const rawW = Number(field.width ?? field.w ?? 120);
        const rawH = Number(field.height ?? field.h ?? 25);

        const x = clamp01(rawX > 1 ? rawX / pageWidth : rawX);
        const y = clamp01(rawY > 1 ? rawY / pageHeight : rawY);
        const w = clamp01(rawW > 1 ? rawW / pageWidth : rawW);
        const h = clamp01(rawH > 1 ? rawH / pageHeight : rawH);

        return {
          request_id: request.id,
          assigned_signer_id: assignedSignerId,
          page: Number(field.page ?? 1) || 1,
          x,
          y,
          w: Math.max(0.001, w),
          h: Math.max(0.001, h),
          type: field.type,
          required: field.required ?? true,
          label: field.label || `${field.type} ${index + 1}`,
          meta: {
            signer_index: signerIndex,
          },
        };
      });

      const { error: fieldsError } = await supabase
        .from("signature_fields")
        .insert(fieldRows as any);
      if (fieldsError) throw fieldsError;

      const { data: sendResponse, error: sendError } = await supabase.functions.invoke(
        "signature_send",
        {
          body: { request_id: request.id },
        },
      );

      if (sendError) {
        throw sendError;
      }
      if (sendResponse?.error) {
        throw new Error(sendResponse.error);
      }
    },
    onSuccess: () => {
      toast({ title: "Signature request sent" });
      setIsCreateOpen(false);
      resetDialogState();
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
      queryClient.invalidateQueries({ queryKey: ["claim-updates"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send signature request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (request: any) => {
      const pathsToDelete = [request.draft_pdf_path, request.final_pdf_path].filter(Boolean);
      if (pathsToDelete.length > 0) {
        await supabase.storage.from("claim-files").remove(pathsToDelete);
      }

      const { error } = await supabase.from("signature_requests").delete().eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Signature request deleted" });
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUploadedPdfChange = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid file",
        description: "Please choose a PDF file",
        variant: "destructive",
      });
      return;
    }

    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }

    setUploadedPdfFile(file);
    setUploadedPreviewUrl(URL.createObjectURL(file));
  };

  const handleOpenDocument = async (request: any) => {
    try {
      const path = request.final_pdf_path || request.draft_pdf_path;
      if (!path) {
        throw new Error("No document is available for this request");
      }

      const { data, error } = await supabase.storage
        .from("claim-files")
        .createSignedUrl(path, 3600);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "Could not open document");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      toast({
        title: "Unable to open document",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      draft: "outline",
      sent: "secondary",
      in_progress: "secondary",
      completed: "default",
      void: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace("_", " ")}</Badge>;
  };

  const getSignerStatusIcon = (status: string) => {
    if (status === "signed") return <Check className="w-4 h-4 text-green-600" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Signature Requests</h3>
          <p className="text-sm text-muted-foreground">
            Build request packets from uploaded PDFs or generated contract templates.
          </p>
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetDialogState();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Request Signature
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Signature Request - Step {currentStep} of 3</DialogTitle>
              <DialogDescription>
                {currentStep === 1 && "Choose source document"}
                {currentStep === 2 && "Place fields (or apply defaults)"}
                {currentStep === 3 && "Configure signers and send"}
              </DialogDescription>
            </DialogHeader>

            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label>Source</Label>
                  <Select
                    value={sourceType}
                    onValueChange={(value) => setSourceType(value as SourceType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="generated">System-generated template</SelectItem>
                      <SelectItem value="uploaded_pdf">Uploaded PDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {sourceType === "generated" ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Contract Template</Label>
                      <Select
                        value={selectedTemplate?.id}
                        onValueChange={(id) => {
                          const found = templates?.find((template) => template.id === id);
                          setSelectedTemplate(found || null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose template" />
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

                    <div>
                      <Label>Field Defaults (optional)</Label>
                      <Select
                        value={selectedFieldTemplateId || "__none__"}
                        onValueChange={(value) => {
                          if (value === "__none__") {
                            setSelectedFieldTemplateId("");
                            setTemplateDefaultFields([]);
                            setPlacedFields([]);
                            setTemplateDefaultsVersion(`none-${Date.now()}`);
                            return;
                          }
                          applyFieldTemplate(value);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a field layout template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No defaults</SelectItem>
                          {fieldTemplates?.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Upload PDF</Label>
                    <Input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(event) => handleUploadedPdfChange(event.target.files?.[0] || null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The uploaded file is used as the draft packet and stays in-app.
                    </p>
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                {!previewUrl ? (
                  <Card>
                    <CardContent className="py-8 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        This template does not have a live PDF preview in step 2 (common for DOCX templates).
                        Apply field defaults so the send flow can proceed.
                      </p>
                      <p className="text-sm">
                        Current field count: <strong>{effectiveFields.length}</strong>
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <FieldPlacementEditor
                    documentUrl={previewUrl}
                    signerCount={signers.length}
                    onFieldsChange={setPlacedFields}
                    initialFields={templateDefaultFields}
                    initialFieldsVersion={templateDefaultsVersion}
                  />
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Signers (ordered)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addSigner}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Signer
                  </Button>
                </div>

                {signers.map((signer, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-12 md:col-span-4">
                      <Input
                        placeholder="Name"
                        value={signer.name}
                        onChange={(event) => updateSigner(index, "name", event.target.value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <Input
                        placeholder="Email"
                        type="email"
                        value={signer.email}
                        onChange={(event) => updateSigner(index, "email", event.target.value)}
                      />
                    </div>
                    <div className="col-span-10 md:col-span-3">
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
                    <div className="col-span-2 md:col-span-1 flex justify-end">
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
                  </div>
                ))}

                <div className="text-sm text-muted-foreground">
                  <p>Source type: <strong>{sourceType}</strong></p>
                  <p>Field count: <strong>{effectiveFields.length}</strong></p>
                </div>
              </div>
            )}

            <DialogFooter>
              <div className="flex justify-between w-full">
                <div>
                  {currentStep > 1 && (
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3)}
                    >
                      <ChevronLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {currentStep === 1 && (
                    <Button
                      onClick={() => setCurrentStep(2)}
                      disabled={!canProceedFromStep1}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                  {currentStep === 2 && (
                    <Button
                      onClick={() => setCurrentStep(3)}
                      disabled={effectiveFields.length === 0}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                  {currentStep === 3 && (
                    <Button
                      onClick={() => createAndSendMutation.mutate()}
                      disabled={createAndSendMutation.isPending}
                    >
                      {createAndSendMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Send for Signature
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
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
          {requests.map((request: any) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileSignature className="w-5 h-5" />
                    <div>
                      <CardTitle className="text-base">
                        {request.document_name || `Signature Request ${request.id.slice(0, 8)}`}
                      </CardTitle>
                      <CardDescription>
                        Created {new Date(request.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDocument(request)}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Open
                    </Button>
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
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Source: <strong>{request.source_type}</strong>
                </p>
                <div className="space-y-1">
                  {(request.signature_signers || [])
                    .sort((a: any, b: any) => a.signing_order - b.signing_order)
                    .map((signer: any) => (
                      <div
                        key={signer.id}
                        className="flex items-center justify-between text-sm p-2 rounded bg-muted/40"
                      >
                        <div className="flex items-center gap-2">
                          {getSignerStatusIcon(signer.status)}
                          <span>{signer.name}</span>
                          <span className="text-muted-foreground">({signer.email})</span>
                        </div>
                        <Badge variant="outline">
                          {signer.status === "signed" && signer.signed_at
                            ? `Signed ${new Date(signer.signed_at).toLocaleDateString()}`
                            : signer.status}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <Upload className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No signature requests yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
