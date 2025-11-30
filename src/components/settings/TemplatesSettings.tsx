import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Download, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const TemplatesSettings = () => {
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    category: "Contract",
    file: null as File | null,
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["document-templates-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!templateForm.file) throw new Error("No file selected");

      const fileName = `${Date.now()}-${templateForm.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("document-templates")
        .upload(fileName, templateForm.file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("document_templates")
        .insert({
          name: templateForm.name,
          description: templateForm.description,
          category: templateForm.category,
          file_path: fileName,
          file_name: templateForm.file.name,
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      toast.success("Template uploaded successfully");
      setIsUploadOpen(false);
      setTemplateForm({ name: "", description: "", category: "Contract", file: null });
      queryClient.invalidateQueries({ queryKey: ["document-templates-all"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (template: any) => {
      // Delete from storage
      await supabase.storage
        .from("document-templates")
        .remove([template.file_path]);

      // Delete from database
      const { error } = await supabase
        .from("document_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["document-templates-all"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleDownload = async (template: any) => {
    try {
      const { data, error } = await supabase.storage
        .from("document-templates")
        .download(template.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = template.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Template Merge Fields</AlertTitle>
        <AlertDescription>
          <p className="mb-2">Use these fields in your Word templates with double curly braces:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm font-mono">
            <div>{`{{claim_number}}`}</div>
            <div>{`{{policyholder_name}}`}</div>
            <div>{`{{policyholder_email}}`}</div>
            <div>{`{{policyholder_phone}}`}</div>
            <div>{`{{policyholder_address}}`}</div>
            <div>{`{{policy_number}}`}</div>
            <div>{`{{loss_date}}`}</div>
            <div>{`{{loss_type}}`}</div>
            <div>{`{{insurance_company}}`}</div>
            <div>{`{{adjuster_name}}`}</div>
            <div>...and more</div>
          </div>
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Document Templates</h2>
          <p className="text-muted-foreground">Manage templates available across all claims</p>
        </div>
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document Template</DialogTitle>
              <DialogDescription>
                Upload a Word document (.docx) with merge fields
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Standard Contract"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={templateForm.category}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Invoice">Invoice</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                    <SelectItem value="Form">Form</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Template File (DOCX)</Label>
                <Input
                  type="file"
                  accept=".docx"
                  onChange={(e) =>
                    setTemplateForm({ ...templateForm, file: e.target.files?.[0] || null })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={!templateForm.name || !templateForm.file || uploadMutation.isPending}
              >
                {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Templates</CardTitle>
          <CardDescription>
            {templates?.length || 0} template(s) available
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates?.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{template.name}</div>
                        {template.description && (
                          <div className="text-sm text-muted-foreground">
                            {template.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{template.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {template.file_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={template.is_active ? "default" : "secondary"}>
                      {template.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(template)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(template)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
