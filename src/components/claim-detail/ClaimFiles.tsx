import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Image, Download, Upload, Eye, Folder, Plus, FolderPlus, File as FileIcon, FileUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const getFileIcon = (type: string) => {
  if (type?.includes("image")) return Image;
  if (type?.includes("pdf")) return FileText;
  return FileIcon;
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
};

export const ClaimFiles = ({ claimId }: { claimId: string }) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [saveAsTemplateDialogOpen, setSaveAsTemplateDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileType, setPreviewFileType] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    category: "Other",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch folders
  const { data: folders } = useQuery({
    queryKey: ["claim-folders", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_folders")
        .select("*")
        .eq("claim_id", claimId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Fetch files
  const { data: files } = useQuery({
    queryKey: ["claim-files", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_files")
        .select("*")
        .eq("claim_id", claimId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (folderName: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("claim_folders")
        .insert({
          claim_id: claimId,
          name: folderName,
          is_predefined: false,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-folders", claimId] });
      setFolderDialogOpen(false);
      setNewFolderName("");
      toast({
        title: "Folder created",
        description: "The folder has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create folder.",
        variant: "destructive",
      });
    },
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedFolderId) throw new Error("No folder selected");

      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = file.name.split(".").pop();
      const fileName = `${claimId}/${selectedFolderId}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("claim-files")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { data, error } = await supabase
        .from("claim_files")
        .insert({
          claim_id: claimId,
          folder_id: selectedFolderId,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          file_type: file.type,
          uploaded_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-files", claimId] });
      setUploadDialogOpen(false);
      setSelectedFolderId(null);
      toast({
        title: "File uploaded",
        description: "The file has been uploaded successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload file.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      await uploadFileMutation.mutateAsync(file);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDownload = async (file: any) => {
    const { data, error } = await supabase.storage
      .from("claim-files")
      .download(file.file_path);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to download file.",
        variant: "destructive",
      });
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleView = async (file: any) => {
    const { data, error } = await supabase.storage
      .from("claim-files")
      .createSignedUrl(file.file_path, 3600);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to view file.",
        variant: "destructive",
      });
      return;
    }

    setPreviewUrl(data.signedUrl);
    setPreviewFileType(file.file_type || "");
    setPreviewDialogOpen(true);
  };

  const handleSaveAsTemplate = (file: any) => {
    setSelectedFile(file);
    setTemplateForm({
      name: file.file_name.replace(/\.[^/.]+$/, ""), // Remove extension
      description: "",
      category: "Other",
    });
    setSaveAsTemplateDialogOpen(true);
  };

  const saveAsTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");

      // Download the file from claim-files
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("claim-files")
        .download(selectedFile.file_path);

      if (downloadError) throw downloadError;

      // Upload to document-templates bucket
      const fileName = `${Date.now()}-${selectedFile.file_name}`;
      const { error: uploadError } = await supabase.storage
        .from("document-templates")
        .upload(fileName, fileData);

      if (uploadError) throw uploadError;

      // Create template record
      const { error: dbError } = await supabase
        .from("document_templates")
        .insert({
          name: templateForm.name,
          description: templateForm.description,
          category: templateForm.category,
          file_path: fileName,
          file_name: selectedFile.file_name,
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      toast({
        title: "Template created",
        description: "File has been saved as a template.",
      });
      setSaveAsTemplateDialogOpen(false);
      setSelectedFile(null);
      setTemplateForm({ name: "", description: "", category: "Other" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (file: any) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("claim-files")
        .remove([file.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("claim_files")
        .delete()
        .eq("id", file.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-files", claimId] });
      toast({
        title: "File deleted",
        description: "The file has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete file.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteFile = async (file: any) => {
    if (confirm("Are you sure you want to delete this file?")) {
      await deleteFileMutation.mutateAsync(file);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Documents & Files</h3>
        <div className="flex gap-2">
          <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <FolderPlus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="folderName">Folder Name</Label>
                  <Input
                    id="folderName"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Enter folder name"
                  />
                </div>
                <Button
                  onClick={() => createFolderMutation.mutate(newFolderName)}
                  disabled={!newFolderName.trim() || createFolderMutation.isPending}
                  className="w-full"
                >
                  Create Folder
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Accordion type="multiple" className="w-full space-y-2">
        {folders?.map((folder) => {
          const folderFiles = files?.filter((f) => f.folder_id === folder.id) || [];
          
          return (
            <AccordionItem
              key={folder.id}
              value={folder.id}
              className="border rounded-lg bg-card"
            >
              <AccordionTrigger className="px-4 hover:no-underline hover:bg-muted/30">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">{folder.name}</span>
                  <Badge variant="secondary" className="ml-2">
                    {folderFiles.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3 mt-3">
                  <Dialog open={uploadDialogOpen && selectedFolderId === folder.id} onOpenChange={(open) => {
                    setUploadDialogOpen(open);
                    if (!open) setSelectedFolderId(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setSelectedFolderId(folder.id)}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload File
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Upload File to {folder.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Input
                          type="file"
                          onChange={handleFileUpload}
                          disabled={uploadingFile}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>

                  {folderFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No files in this folder
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {folderFiles.map((file) => {
                        const Icon = getFileIcon(file.file_type);
                        return (
                          <div
                            key={file.id}
                            className="p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {file.file_name}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatFileSize(file.file_size || 0)} •{" "}
                                  {new Date(file.uploaded_at).toLocaleDateString()}
                                </p>
                                <div className="flex gap-2 mt-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleView(file)}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(file)}
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                  {file.file_name.endsWith('.docx') && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleSaveAsTemplate(file)}
                                    >
                                      <FileUp className="h-3 w-3 mr-1" />
                                      Save as Template
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteFile(file)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {!folders?.length && (
        <p className="text-muted-foreground text-center py-8">
          No folders yet. Create your first folder to start uploading files.
        </p>
      )}

      <Dialog open={saveAsTemplateDialogOpen} onOpenChange={setSaveAsTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Save this document as a reusable template for future claims
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateForm.name}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, name: e.target.value })
                }
                placeholder="e.g., Standard Contract"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, description: e.target.value })
                }
                placeholder="Optional description"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) =>
                  setTemplateForm({ ...templateForm, category: value })
                }
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
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveAsTemplateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveAsTemplateMutation.mutate()}
              disabled={!templateForm.name || saveAsTemplateMutation.isPending}
            >
              {saveAsTemplateMutation.isPending ? "Saving..." : "Save as Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>File Preview</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh]">
            {previewUrl && (
              <>
                {previewFileType.includes("image") ? (
                  <img 
                    src={previewUrl} 
                    alt="Preview" 
                    className="w-full h-auto rounded-lg"
                  />
                ) : previewFileType.includes("pdf") ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-[70vh] rounded-lg border"
                    title="PDF Preview"
                  />
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Preview not available for this file type
                    </p>
                    <Button onClick={() => window.open(previewUrl, "_blank")}>
                      Open in New Tab
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
