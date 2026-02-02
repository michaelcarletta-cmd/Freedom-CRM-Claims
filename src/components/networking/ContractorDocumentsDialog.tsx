import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download, 
  Calendar,
  Loader2,
  AlertTriangle,
  Shield,
  FileCheck
} from "lucide-react";
import { format, isPast, addDays } from "date-fns";

interface ContractorDocument {
  id: string;
  document_type: string;
  document_name: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
}

interface ContractorDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

const DOCUMENT_TYPES = [
  { value: "w9", label: "W-9 Form" },
  { value: "insurance", label: "Insurance Certificate" },
  { value: "license", label: "License" },
  { value: "contract", label: "Contract/Agreement" },
  { value: "other", label: "Other" },
];

export const ContractorDocumentsDialog = ({
  open,
  onOpenChange,
  contractor,
}: ContractorDocumentsDialogProps) => {
  const [documents, setDocuments] = useState<ContractorDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<ContractorDocument | null>(null);
  
  // Upload form state
  const [documentType, setDocumentType] = useState("w9");
  const [documentName, setDocumentName] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (open && contractor) {
      fetchDocuments();
    }
  }, [open, contractor]);

  const fetchDocuments = async () => {
    if (!contractor) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("contractor_documents")
      .select("*")
      .eq("contractor_id", contractor.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load documents");
      console.error(error);
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 10MB limit
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setSelectedFile(file);
      if (!documentName) {
        setDocumentName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUpload = async () => {
    if (!contractor || !selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }

    if (!documentName.trim()) {
      toast.error("Please enter a document name");
      return;
    }

    setUploading(true);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `${contractor.id}/${Date.now()}-${selectedFile.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("contractor-documents")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Create database record
      const { error: dbError } = await supabase
        .from("contractor_documents")
        .insert({
          contractor_id: contractor.id,
          document_type: documentType,
          document_name: documentName,
          file_name: selectedFile.name,
          file_path: filePath,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          expiration_date: expirationDate || null,
          notes: notes || null,
        });

      if (dbError) throw dbError;

      toast.success("Document uploaded successfully");
      
      // Reset form
      setSelectedFile(null);
      setDocumentName("");
      setDocumentType("w9");
      setExpirationDate("");
      setNotes("");
      
      // Refresh list
      fetchDocuments();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to upload document: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ContractorDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("contractor-documents")
        .download(doc.file_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error("Failed to download document");
    }
  };

  const handleDeleteClick = (doc: ContractorDocument) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;

    try {
      // Delete from storage
      await supabase.storage
        .from("contractor-documents")
        .remove([documentToDelete.file_path]);

      // Delete from database
      const { error } = await supabase
        .from("contractor_documents")
        .delete()
        .eq("id", documentToDelete.id);

      if (error) throw error;

      toast.success("Document deleted");
      fetchDocuments();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("Failed to delete document");
    } finally {
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    return DOCUMENT_TYPES.find(t => t.value === type)?.label || type;
  };

  const getExpirationBadge = (expirationDate: string | null) => {
    if (!expirationDate) return null;
    
    const expDate = new Date(expirationDate);
    const isExpired = isPast(expDate);
    const isExpiringSoon = !isExpired && isPast(addDays(new Date(), -30)) && expDate <= addDays(new Date(), 30);
    
    if (isExpired) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Expired
        </Badge>
      );
    }
    
    if (isExpiringSoon) {
      return (
        <Badge variant="outline" className="flex items-center gap-1 border-amber-500 text-amber-500">
          <Calendar className="h-3 w-3" />
          Expires Soon
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        {format(expDate, "MMM d, yyyy")}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents - {contractor?.full_name || contractor?.email}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Upload Section */}
            <div className="p-4 border border-dashed border-border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4" />
                Upload New Document
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Document Type</Label>
                  <Select value={documentType} onValueChange={setDocumentType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs">Expiration Date (optional)</Label>
                  <Input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Document Name</Label>
                <Input
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="e.g., 2024 W-9 Form"
                  className="h-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="h-9 flex-1"
                />
                <Button 
                  onClick={handleUpload} 
                  disabled={!selectedFile || uploading}
                  size="sm"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-1" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Documents List */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No documents uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-2 bg-primary/10 rounded">
                          {doc.document_type === "insurance" ? (
                            <Shield className="h-4 w-4 text-primary" />
                          ) : doc.document_type === "w9" ? (
                            <FileCheck className="h-4 w-4 text-primary" />
                          ) : (
                            <FileText className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{doc.document_name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {getDocumentTypeLabel(doc.document_type)}
                            </Badge>
                            {getExpirationBadge(doc.expiration_date)}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{doc.file_name}</span>
                            {doc.file_size && (
                              <>
                                <span>•</span>
                                <span>{formatFileSize(doc.file_size)}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>Uploaded {format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(doc)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(doc)}
                          className="text-destructive hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{documentToDelete?.document_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
