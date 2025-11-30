import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Image, Download, Upload, Eye, Folder, Plus, FolderPlus, File as FileIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

    window.open(data.signedUrl, "_blank");
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
                  <span className="font-medium">{folder.name}</span>
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
                                    className="flex-1"
                                    onClick={() => handleView(file)}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => handleDownload(file)}
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
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
    </div>
  );
};
