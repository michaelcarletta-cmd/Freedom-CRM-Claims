import { useEffect, useRef, useState } from "react";
import { Canvas as FabricCanvas, PencilBrush, Circle, Rect, FabricText, FabricImage } from "fabric";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Square, Circle as CircleIcon, Type, Undo, Eraser, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PhotoAnnotationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: {
    id: string;
    file_path: string;
    file_name: string;
    annotations: any;
  };
  claimId: string;
  onSave: () => void;
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000", "#ffffff"];

export function PhotoAnnotationEditor({ open, onOpenChange, photo, claimId, onSave }: PhotoAnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeColor, setActiveColor] = useState("#ef4444");
  const [activeTool, setActiveTool] = useState<"select" | "draw" | "rectangle" | "circle" | "text">("draw");
  const [textInput, setTextInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !canvasRef.current) return;

    let canvas: FabricCanvas | null = null;
    let isMounted = true;

    const loadImage = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("claim-files")
          .createSignedUrl(photo.file_path, 3600);
        
        if (error || !data?.signedUrl) {
          console.error("Error getting signed URL:", error);
          return;
        }

        if (!isMounted) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onerror = (e) => {
          console.error("Error loading image:", e);
        };

        img.onload = () => {
          if (!canvasRef.current || !isMounted) return;
          
          // Calculate canvas size to fit within dialog
          const maxWidth = 800;
          const maxHeight = 600;
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
          }

          canvas = new FabricCanvas(canvasRef.current, {
            width,
            height,
            backgroundColor: "#ffffff",
          });

          // Load background image
          FabricImage.fromURL(data.signedUrl, { crossOrigin: "anonymous" }).then((fabricImg) => {
            if (!canvas || !isMounted) return;
            fabricImg.scaleToWidth(width);
            fabricImg.scaleToHeight(height);
            canvas.backgroundImage = fabricImg;
            canvas.renderAll();
            setImageLoaded(true);
          }).catch((err) => {
            console.error("Error loading fabric image:", err);
          });

          // Initialize drawing brush
          canvas.freeDrawingBrush = new PencilBrush(canvas);
          canvas.freeDrawingBrush.color = activeColor;
          canvas.freeDrawingBrush.width = 3;
          canvas.isDrawingMode = true;

          // Load existing annotations if any
          if (photo.annotations) {
            try {
              canvas.loadFromJSON(photo.annotations, () => {
                canvas?.renderAll();
              });
            } catch (e) {
              console.error("Error loading annotations:", e);
            }
          }

          setFabricCanvas(canvas);
        };
        img.src = data.signedUrl;
      } catch (err) {
        console.error("Error in loadImage:", err);
      }
    };

    // Reset state when opening
    setImageLoaded(false);
    setFabricCanvas(null);
    
    loadImage();

    return () => {
      isMounted = false;
      if (canvas) {
        canvas.dispose();
      }
      setFabricCanvas(null);
      setImageLoaded(false);
    };
  }, [open, photo.file_path, photo.id]);

  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = activeTool === "draw";
    
    if (activeTool === "draw" && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = activeColor;
      fabricCanvas.freeDrawingBrush.width = 3;
    }
  }, [activeTool, activeColor, fabricCanvas]);

  const handleToolClick = (tool: typeof activeTool) => {
    if (!fabricCanvas) return;
    
    setActiveTool(tool);

    if (tool === "rectangle") {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: "transparent",
        stroke: activeColor,
        strokeWidth: 3,
        width: 100,
        height: 80,
      });
      fabricCanvas.add(rect);
      fabricCanvas.setActiveObject(rect);
    } else if (tool === "circle") {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: "transparent",
        stroke: activeColor,
        strokeWidth: 3,
        radius: 50,
      });
      fabricCanvas.add(circle);
      fabricCanvas.setActiveObject(circle);
    } else if (tool === "text" && textInput) {
      const text = new FabricText(textInput, {
        left: 100,
        top: 100,
        fill: activeColor,
        fontSize: 24,
        fontFamily: "Arial",
      });
      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      setTextInput("");
    }
  };

  const handleUndo = () => {
    if (!fabricCanvas) return;
    const objects = fabricCanvas.getObjects();
    if (objects.length > 0) {
      fabricCanvas.remove(objects[objects.length - 1]);
    }
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    const objects = fabricCanvas.getObjects();
    objects.forEach(obj => fabricCanvas.remove(obj));
    fabricCanvas.renderAll();
  };

  const handleSave = async () => {
    if (!fabricCanvas) return;
    
    setSaving(true);
    try {
      // Save annotations JSON
      const annotationsJson = fabricCanvas.toJSON();
      
      // Generate annotated image
      const dataUrl = fabricCanvas.toDataURL({
        format: "png",
        quality: 1,
        multiplier: 2,
      });
      
      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      // Upload annotated image
      const annotatedPath = `${claimId}/photos/annotated_${photo.id}.png`;
      const { error: uploadError } = await supabase.storage
        .from("claim-files")
        .upload(annotatedPath, blob, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Update photo record
      const { error: updateError } = await supabase
        .from("claim_photos")
        .update({
          annotations: annotationsJson,
          annotated_file_path: annotatedPath,
        })
        .eq("id", photo.id);
      
      if (updateError) throw updateError;
      
      toast({ title: "Annotations saved" });
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Save error:", error);
      toast({ title: "Error saving annotations", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Annotate Photo: {photo.file_name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <div className="flex gap-1 border-r pr-2">
              <Button
                variant={activeTool === "draw" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setActiveTool("draw")}
                title="Draw"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === "rectangle" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => handleToolClick("rectangle")}
                title="Rectangle"
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === "circle" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => handleToolClick("circle")}
                title="Circle"
              >
                <CircleIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === "select" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setActiveTool("select")}
                title="Select"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l7 17 2.5-6.5L20 12z" />
                </svg>
              </Button>
            </div>
            
            <div className="flex items-center gap-1 border-r pr-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Add text..."
                className="h-8 w-32"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleToolClick("text")}
                disabled={!textInput}
                title="Add Text"
              >
                <Type className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex gap-1 border-r pr-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  className={`w-6 h-6 rounded border-2 ${activeColor === color ? "border-primary" : "border-transparent"}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setActiveColor(color)}
                />
              ))}
            </div>
            
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={handleUndo} title="Undo">
                <Undo className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleClear} title="Clear All">
                <Eraser className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Canvas */}
          <div className="border rounded-lg overflow-hidden bg-muted flex justify-center">
            {!imageLoaded && (
              <div className="w-full h-64 flex items-center justify-center text-muted-foreground">
                Loading image...
              </div>
            )}
            <canvas ref={canvasRef} className={imageLoaded ? "" : "hidden"} />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Annotations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
