import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, Trash2, FileText, Video, Loader2, CheckCircle, XCircle, Clock, Brain, Image, Link, Globe } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIES = [
  { value: "insurance-regulations", label: "Insurance Regulations" },
  { value: "building-codes", label: "Building Codes" },
  { value: "manufacturer-specs", label: "Manufacturer Specifications" },
  { value: "company-policies", label: "Company Policies" },
  { value: "training-materials", label: "Training Materials" },
  { value: "legal-documents", label: "Legal Documents" },
  { value: "other", label: "Other" },
];

const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.avi,.mkv,.mp3,.wav,.m4a,.amr,.webm,.jpg,.jpeg,.png,.gif,.webp,.bmp";

export const AIKnowledgeBaseSettings = () => {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  
  // URL upload state
  const [urlInput, setUrlInput] = useState("");
  const [urlCategory, setUrlCategory] = useState<string>("");
  const [urlDescription, setUrlDescription] = useState("");
  const [urlUploading, setUrlUploading] = useState(false);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["ai-knowledge-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_documents")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const doc = documents?.find(d => d.id === docId);
      if (!doc) throw new Error("Document not found");

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("ai-knowledge-base")
        .remove([doc.file_path]);
      
      if (storageError) console.error("Storage delete error:", storageError);

      // Delete from database (chunks will cascade delete)
      const { error } = await supabase
        .from("ai_knowledge_documents")
        .delete()
        .eq("id", docId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge-documents"] });
      toast.success("Document deleted");
      setDeleteDocId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete document");
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 20MB)`);
        continue;
      }
      validFiles.push(file);
    }
    
    setSelectedFiles(validFiles);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !category) {
      toast.error("Please select file(s) and category");
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress({ current: i + 1, total: selectedFiles.length });

        try {
          // Upload file to storage
          const filePath = `${user.id}/${Date.now()}-${file.name}`;

          const { error: uploadError } = await supabase.storage
            .from("ai-knowledge-base")
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          // Create document record
          const { data: docData, error: docError } = await supabase
            .from("ai_knowledge_documents")
            .insert({
              file_name: file.name,
              file_path: filePath,
              file_type: file.type,
              file_size: file.size,
              category,
              description: description || null,
              uploaded_by: user.id,
              status: "pending",
            })
            .select()
            .single();

          if (docError) throw docError;

          // Trigger processing (don't await, let it run in background)
          supabase.functions.invoke(
            "process-knowledge-document",
            { body: { documentId: docData.id } }
          ).catch(err => console.error("Processing trigger error:", err));

          successCount++;
        } catch (error: any) {
          console.error(`Upload error for ${file.name}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} file(s) uploaded and processing started`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} file(s) failed to upload`);
      }

      // Reset form
      setSelectedFiles([]);
      setCategory("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge-documents"] });

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload documents");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleUrlUpload = async () => {
    if (!urlInput || !urlCategory) {
      toast.error("Please enter a URL and select a category");
      return;
    }

    // Validate URL
    let url: URL;
    try {
      url = new URL(urlInput.startsWith('http') ? urlInput : `https://${urlInput}`);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    setUrlUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create document record for URL
      const { data: docData, error: docError } = await supabase
        .from("ai_knowledge_documents")
        .insert({
          file_name: url.hostname,
          file_path: url.toString(),
          file_type: "url",
          file_size: null,
          category: urlCategory,
          description: urlDescription || null,
          uploaded_by: user.id,
          status: "pending",
        })
        .select()
        .single();

      if (docError) throw docError;

      // Trigger URL processing
      supabase.functions.invoke(
        "process-knowledge-url",
        { body: { documentId: docData.id, url: url.toString() } }
      ).catch(err => console.error("URL processing trigger error:", err));

      toast.success("URL submitted for processing");

      // Reset form
      setUrlInput("");
      setUrlCategory("");
      setUrlDescription("");
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge-documents"] });

    } catch (error: any) {
      console.error("URL upload error:", error);
      toast.error(error.message || "Failed to submit URL");
    } finally {
      setUrlUploading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Processed</Badge>;
      case "processing":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const getFileIcon = (fileName: string, fileType?: string) => {
    if (fileType === 'url') {
      return <Globe className="h-5 w-5 text-cyan-400" />;
    }
    if (fileName.match(/\.(mp4|mov|avi|mkv|mp3|wav|m4a|webm)$/i)) {
      return <Video className="h-5 w-5 text-purple-400" />;
    }
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
      return <Image className="h-5 w-5 text-green-400" />;
    }
    if (fileName.match(/\.(ppt|pptx)$/i)) {
      return <FileText className="h-5 w-5 text-orange-400" />;
    }
    return <FileText className="h-5 w-5 text-blue-400" />;
  };

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Knowledge Base
          </CardTitle>
          <CardDescription>
            Upload documents, images, videos, or add URLs to train the AI assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="files" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Files
              </TabsTrigger>
              <TabsTrigger value="url" className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                Add URL
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="files" className="space-y-4 mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>File(s) - Select multiple for bulk upload</Label>
                  <Input
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="cursor-pointer"
                    multiple
                  />
                  {selectedFiles.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {selectedFiles.length} file(s) ({(selectedFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB total)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={category} onValueChange={setCategory} disabled={uploading}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the document content..."
                  disabled={uploading}
                  rows={2}
                />
              </div>

              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || !category || uploading}
                className="w-full md:w-auto"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : 'Uploading...'}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {selectedFiles.length > 1 ? `${selectedFiles.length} Documents` : 'Document'}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Supported: PDF, Word docs, PowerPoint, images (JPG, PNG), video/audio files. Max 20MB per file.
              </p>
            </TabsContent>
            
            <TabsContent value="url" className="space-y-4 mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Website URL *</Label>
                  <Input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/page"
                    disabled={urlUploading}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={urlCategory} onValueChange={setUrlCategory} disabled={urlUploading}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={urlDescription}
                  onChange={(e) => setUrlDescription(e.target.value)}
                  placeholder="Brief description of what this page contains..."
                  disabled={urlUploading}
                  rows={2}
                />
              </div>

              <Button
                onClick={handleUrlUpload}
                disabled={!urlInput || !urlCategory || urlUploading}
                className="w-full md:w-auto"
              >
                {urlUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing URL...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Add URL
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                The AI will fetch and analyze the webpage content. Processing takes 30-60 seconds.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Uploaded Documents</CardTitle>
          <CardDescription>
            {documents?.length || 0} documents in the knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents && documents.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {getFileIcon(doc.file_name, doc.file_type)}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{doc.file_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(doc.category)}
                          </Badge>
                          {getStatusBadge(doc.status)}
                          {doc.error_message && (
                            <span className="text-xs text-red-400 truncate max-w-[200px]">
                              {doc.error_message}
                            </span>
                          )}
                        </div>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteDocId(doc.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No documents uploaded yet</p>
              <p className="text-sm">Upload documents to enhance the AI assistant's knowledge</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteDocId} onOpenChange={() => setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This will remove all extracted knowledge from the AI assistant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDocId && deleteMutation.mutate(deleteDocId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
