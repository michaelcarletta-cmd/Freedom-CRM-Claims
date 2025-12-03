import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Upload, Pencil, Trash2, Link2, FileText, Grid, Columns, X, Download, Eye, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PhotoAnnotationEditor } from "./PhotoAnnotationEditor";
import { PhotoReportDialog } from "./PhotoReportDialog";

interface ClaimPhoto {
  id: string;
  claim_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  category: string;
  description: string | null;
  annotations: any;
  annotated_file_path: string | null;
  before_after_type: string | null;
  before_after_pair_id: string | null;
  taken_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ClaimPhotosProps {
  claimId: string;
  claim: any;
}

const PHOTO_CATEGORIES = [
  "Exterior - Front",
  "Exterior - Back",
  "Exterior - Left",
  "Exterior - Right",
  "Roof - Overview",
  "Roof - Damage",
  "Roof - Shingles",
  "Roof - Flashing",
  "Roof - Gutters",
  "Interior - Living Areas",
  "Interior - Bedrooms",
  "Interior - Bathrooms",
  "Interior - Kitchen",
  "Interior - Basement",
  "Interior - Attic",
  "Water Damage",
  "Fire Damage",
  "Storm Damage",
  "Hail Damage",
  "Wind Damage",
  "Mold",
  "Before Repairs",
  "After Repairs",
  "General",
];

export function ClaimPhotos({ claimId, claim }: ClaimPhotosProps) {
  const [photos, setPhotos] = useState<ClaimPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [annotateDialogOpen, setAnnotateDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ClaimPhoto | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "before-after">("grid");
  
  // Upload form state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState("General");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadBeforeAfter, setUploadBeforeAfter] = useState<string | null>(null);
  
  // Camera state
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Edit form state
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  
  const { toast } = useToast();

  useEffect(() => {
    fetchPhotos();
  }, [claimId]);

  // Connect camera stream to video element when both are available
  useEffect(() => {
    if (cameraDialogOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraDialogOpen, cameraStream]);

  // Batch fetch all signed URLs when photos change
  const fetchSignedUrls = useCallback(async (photosToFetch: ClaimPhoto[]) => {
    if (photosToFetch.length === 0) return;
    
    const urlPromises = photosToFetch.map(async (photo) => {
      const path = photo.annotated_file_path || photo.file_path;
      const { data } = await supabase.storage
        .from("claim-files")
        .createSignedUrl(path, 3600);
      return { id: photo.id, url: data?.signedUrl || "" };
    });
    
    const results = await Promise.all(urlPromises);
    const urlMap: Record<string, string> = {};
    results.forEach(({ id, url }) => {
      if (url) urlMap[id] = url;
    });
    setPhotoUrls(urlMap);
  }, []);

  const fetchPhotos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("claim_photos")
      .select("*")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching photos:", error);
      toast({ title: "Error loading photos", variant: "destructive" });
    } else {
      setPhotos(data || []);
      // Batch fetch all signed URLs
      await fetchSignedUrls(data || []);
    }
    setLoading(false);
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from("claim-files")
      .createSignedUrl(path, 3600);
    return data?.signedUrl;
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    
    setUploading(true);
    try {
      for (const file of uploadFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${claimId}/photos/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from("claim-files")
          .upload(filePath, file);
        
        if (uploadError) throw uploadError;
        
        const { error: dbError } = await supabase.from("claim_photos").insert({
          claim_id: claimId,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          category: uploadCategory,
          description: uploadDescription || null,
          before_after_type: uploadBeforeAfter,
        });
        
        if (dbError) throw dbError;
      }
      
      toast({ title: `${uploadFiles.length} photo(s) uploaded successfully` });
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadCategory("General");
      setUploadDescription("");
      setUploadBeforeAfter(null);
      fetchPhotos();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Error uploading photos", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedPhoto) return;
    
    try {
      const { error } = await supabase
        .from("claim_photos")
        .update({
          category: editCategory,
          description: editDescription || null,
        })
        .eq("id", selectedPhoto.id);
      
      if (error) throw error;
      
      toast({ title: "Photo updated" });
      setEditDialogOpen(false);
      fetchPhotos();
    } catch (error: any) {
      toast({ title: "Error updating photo", variant: "destructive" });
    }
  };

  const handleDelete = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    
    try {
      await supabase.storage.from("claim-files").remove([photo.file_path]);
      if (photo.annotated_file_path) {
        await supabase.storage.from("claim-files").remove([photo.annotated_file_path]);
      }
      
      const { error } = await supabase.from("claim_photos").delete().eq("id", photoId);
      if (error) throw error;
      
      toast({ title: "Photo deleted" });
      fetchPhotos();
    } catch (error) {
      toast({ title: "Error deleting photo", variant: "destructive" });
    }
  };

  const handleLinkBeforeAfter = async (beforeId: string, afterId: string) => {
    const pairId = crypto.randomUUID();
    
    try {
      await supabase
        .from("claim_photos")
        .update({ before_after_type: "before", before_after_pair_id: pairId })
        .eq("id", beforeId);
      
      await supabase
        .from("claim_photos")
        .update({ before_after_type: "after", before_after_pair_id: pairId })
        .eq("id", afterId);
      
      toast({ title: "Before/After pair linked" });
      setLinkDialogOpen(false);
      setSelectedPhotos([]);
      fetchPhotos();
    } catch (error) {
      toast({ title: "Error linking photos", variant: "destructive" });
    }
  };

  // Camera functions
  const startCamera = async () => {
    setCameraDialogOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      setCameraStream(stream);
    } catch (error) {
      console.error("Camera error:", error);
      toast({ 
        title: "Camera access denied", 
        description: "Please allow camera access to take photos.",
        variant: "destructive" 
      });
      setCameraDialogOpen(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraDialogOpen(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      setUploading(true);
      try {
        const fileName = `camera_${Date.now()}.jpg`;
        const filePath = `${claimId}/photos/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from("claim-files")
          .upload(filePath, blob);
        
        if (uploadError) throw uploadError;
        
        const { error: dbError } = await supabase.from("claim_photos").insert({
          claim_id: claimId,
          file_path: filePath,
          file_name: fileName,
          file_size: blob.size,
          category: uploadCategory,
          taken_at: new Date().toISOString(),
        });
        
        if (dbError) throw dbError;
        
        toast({ title: "Photo captured successfully" });
        fetchPhotos();
      } catch (error: any) {
        toast({ title: "Error saving photo", description: error.message, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    }, "image/jpeg", 0.9);
  };

  const openEditDialog = (photo: ClaimPhoto) => {
    setSelectedPhoto(photo);
    setEditCategory(photo.category);
    setEditDescription(photo.description || "");
    setEditDialogOpen(true);
  };

  const openAnnotateDialog = (photo: ClaimPhoto) => {
    setSelectedPhoto(photo);
    setAnnotateDialogOpen(true);
  };

  const openPreviewDialog = (photo: ClaimPhoto) => {
    setSelectedPhoto(photo);
    setPreviewDialogOpen(true);
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev => 
      prev.includes(photoId) 
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  const categories = ["all", ...new Set(photos.map(p => p.category))];
  const filteredPhotos = activeCategory === "all" 
    ? photos 
    : photos.filter(p => p.category === activeCategory);

  const beforeAfterPairs = photos
    .filter(p => p.before_after_pair_id && p.before_after_type === "before")
    .map(beforePhoto => {
      const afterPhoto = photos.find(
        p => p.before_after_pair_id === beforePhoto.before_after_pair_id && p.before_after_type === "after"
      );
      return { before: beforePhoto, after: afterPhoto };
    })
    .filter(pair => pair.after);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Photos ({photos.length})</h3>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "before-after" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("before-after")}
            >
              <Columns className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {selectedPhotos.length === 2 && (
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(true)}>
              <Link2 className="h-4 w-4 mr-2" />
              Link Before/After
            </Button>
          )}
          {selectedPhotos.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSelectedPhotos([])}>
              <X className="h-4 w-4 mr-2" />
              Clear ({selectedPhotos.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setReportDialogOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
          <Button variant="outline" size="sm" onClick={startCamera}>
            <Camera className="h-4 w-4 mr-2" />
            Take Photo
          </Button>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Upload Photos
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Photos</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Select Photos</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                    className="mt-1"
                  />
                  {uploadFiles.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {uploadFiles.length} file(s) selected
                    </p>
                  )}
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHOTO_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Before/After Type (Optional)</Label>
                  <Select 
                    value={uploadBeforeAfter || "none"} 
                    onValueChange={(v) => setUploadBeforeAfter(v === "none" ? null : v)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="before">Before</SelectItem>
                      <SelectItem value="after">After</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="Describe the photos..."
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0}>
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <Badge
            key={cat}
            variant={activeCategory === cat ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveCategory(cat)}
          >
            {cat === "all" ? "All" : cat}
          </Badge>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading photos...</div>
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Camera className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No photos uploaded yet</p>
            <Button variant="outline" className="mt-4" onClick={() => setUploadDialogOpen(true)}>
              Upload First Photo
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map(photo => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              imageUrl={photoUrls[photo.id] || ""}
              selected={selectedPhotos.includes(photo.id)}
              onSelect={() => togglePhotoSelection(photo.id)}
              onEdit={() => openEditDialog(photo)}
              onAnnotate={() => openAnnotateDialog(photo)}
              onDelete={() => handleDelete(photo.id)}
              onPreview={() => openPreviewDialog(photo)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <h4 className="font-medium">Before/After Comparisons</h4>
          {beforeAfterPairs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No before/after pairs created. Select 2 photos and click "Link Before/After" to create a pair.
            </p>
          ) : (
            beforeAfterPairs.map((pair, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2 text-center">Before</p>
                  <PhotoCard
                    photo={pair.before}
                    imageUrl={photoUrls[pair.before.id] || ""}
                    selected={false}
                    onSelect={() => {}}
                    onEdit={() => openEditDialog(pair.before)}
                    onAnnotate={() => openAnnotateDialog(pair.before)}
                    onDelete={() => handleDelete(pair.before.id)}
                    onPreview={() => openPreviewDialog(pair.before)}
                    compact
                  />
                </div>
                {pair.after && (
                  <div>
                    <p className="text-sm font-medium mb-2 text-center">After</p>
                    <PhotoCard
                      photo={pair.after}
                      imageUrl={photoUrls[pair.after.id] || ""}
                      selected={false}
                      onSelect={() => {}}
                      onEdit={() => openEditDialog(pair.after)}
                      onAnnotate={() => openAnnotateDialog(pair.after)}
                      onDelete={() => handleDelete(pair.after.id)}
                      onPreview={() => openPreviewDialog(pair.after)}
                      compact
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Photo Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Before/After Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Before/After Photos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You've selected 2 photos. Choose which is the "Before" and which is the "After":
          </p>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {selectedPhotos.map((photoId, idx) => {
              const photo = photos.find(p => p.id === photoId);
              if (!photo) return null;
              return (
                <div key={photoId} className="text-center">
                  <p className="text-sm font-medium mb-2">{idx === 0 ? "Before" : "After"}</p>
                  <img
                    src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/claim-files/${photo.file_path}`}
                    alt={photo.file_name}
                    className="rounded aspect-square object-cover"
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => handleLinkBeforeAfter(selectedPhotos[0], selectedPhotos[1])}>
              Create Pair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Annotation Dialog */}
      {selectedPhoto && (
        <PhotoAnnotationEditor
          open={annotateDialogOpen}
          onOpenChange={setAnnotateDialogOpen}
          photo={selectedPhoto}
          claimId={claimId}
          onSave={fetchPhotos}
        />
      )}

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedPhoto?.file_name}</DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-4">
              <PhotoPreview photo={selectedPhoto} imageUrl={photoUrls[selectedPhoto.id] || ""} />
              <div className="flex justify-between items-start">
                <div>
                  <Badge>{selectedPhoto.category}</Badge>
                  {selectedPhoto.description && (
                    <p className="text-sm text-muted-foreground mt-2">{selectedPhoto.description}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={cameraDialogOpen} onOpenChange={(open) => { if (!open) stopCamera(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Take Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={stopCamera}>Close</Button>
            <Button onClick={capturePhoto} disabled={uploading}>
              <Camera className="h-4 w-4 mr-2" />
              {uploading ? "Saving..." : "Capture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <PhotoReportDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        photos={photos}
        claim={claim}
        claimId={claimId}
      />
    </div>
  );
}

const PhotoCard = memo(function PhotoCard({ 
  photo, 
  imageUrl,
  selected, 
  onSelect, 
  onEdit, 
  onAnnotate, 
  onDelete,
  onPreview,
  compact = false 
}: { 
  photo: ClaimPhoto; 
  imageUrl: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onAnnotate: () => void;
  onDelete: () => void;
  onPreview: () => void;
  compact?: boolean;
}) {
  return (
    <Card 
      className={`overflow-hidden cursor-pointer transition-all ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={onSelect}
    >
      <div className="relative aspect-square">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={photo.file_name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        {photo.annotated_file_path && (
          <Badge className="absolute top-2 left-2" variant="secondary">
            <Pencil className="h-3 w-3 mr-1" />
            Annotated
          </Badge>
        )}
        {photo.before_after_type && (
          <Badge className="absolute top-2 right-2" variant="outline">
            {photo.before_after_type === "before" ? "Before" : "After"}
          </Badge>
        )}
      </div>
      {!compact && (
        <CardContent className="p-2">
          <p className="text-xs font-medium truncate">{photo.category}</p>
          {photo.description && (
            <p className="text-xs text-muted-foreground truncate">{photo.description}</p>
          )}
          <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPreview}>
              <Eye className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAnnotate}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <FileText className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
});

function PhotoPreview({ photo, imageUrl }: { photo: ClaimPhoto; imageUrl: string }) {
  return imageUrl ? (
    <img src={imageUrl} alt={photo.file_name} className="max-h-[60vh] mx-auto rounded" />
  ) : (
    <div className="h-64 bg-muted flex items-center justify-center rounded">
      <Camera className="h-8 w-8 text-muted-foreground" />
    </div>
  );
}
