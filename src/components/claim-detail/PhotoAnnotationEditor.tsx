import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, PencilBrush, Circle, Rect, FabricText, FabricImage } from "fabric";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Square, Circle as CircleIcon, Type, Undo, Eraser, Save, Loader2 } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const [activeColor, setActiveColor] = useState("#ef4444");
  const [activeTool, setActiveTool] = useState<"select" | "draw" | "rectangle" | "circle" | "text">("draw");
  const [textInput, setTextInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Cleanup function
  const cleanup = useCallback(() => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
    setImageLoaded(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }

    // Small delay to ensure dialog is mounted
    const timeoutId = setTimeout(() => {
      if (!containerRef.current) return;

      setIsLoading(true);
      let isMounted = true;

      const initCanvas = async () => {
        try {
          const { data, error } = await supabase.storage
            .from("claim-files")
            .createSignedUrl(photo.file_path, 3600);

          if (error || !data?.signedUrl) {
            console.error("Error getting signed URL:", error);
            setIsLoading(false);
            return;
          }

          if (!isMounted || !containerRef.current) return;

          const img = new Image();
          img.crossOrigin = "anonymous";

          img.onerror = () => {
            console.error("Error loading image");
            setIsLoading(false);
          };

          img.onload = () => {
            if (!isMounted || !containerRef.current) return;

            // Calculate canvas size
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

            // Clear container and create fresh canvas element
            containerRef.current.innerHTML = "";
            const canvasEl = document.createElement("canvas");
            canvasEl.width = width;
            canvasEl.height = height;
            containerRef.current.appendChild(canvasEl);

            // Initialize Fabric canvas
            const canvas = new FabricCanvas(canvasEl, {
              width,
              height,
              backgroundColor: "#ffffff",
            });

            // Set background image
            const fabricImg = new FabricImage(img);
            fabricImg.scaleToWidth(width);
            fabricImg.scaleToHeight(height);
            canvas.backgroundImage = fabricImg;
            canvas.renderAll();

            // Initialize drawing brush
            canvas.freeDrawingBrush = new PencilBrush(canvas);
            canvas.freeDrawingBrush.color = activeColor;
            canvas.freeDrawingBrush.width = 3;
            canvas.isDrawingMode = true;

            // Load existing annotations
            if (photo.annotations) {
              try {
                canvas.loadFromJSON(photo.annotations, () => {
                  canvas.renderAll();
                });
              } catch (e) {
                console.error("Error loading annotations:", e);
              }
            }

            fabricCanvasRef.current = canvas;
            setImageLoaded(true);
            setIsLoading(false);
          };

          img.src = data.signedUrl;
        } catch (err) {
          console.error("Error initializing canvas:", err);
          setIsLoading(false);
        }
      };

      initCanvas();

      return () => {
        isMounted = false;
      };
    }, 150);

    return () => {
      clearTimeout(timeoutId);
      cleanup();
    };
  }, [open, photo.file_path, photo.id, cleanup]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = activeTool === "draw";

    if (activeTool === "draw" && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = 3;
    }
  }, [activeTool, activeColor, imageLoaded]);

  const handleToolClick = (tool: typeof activeTool) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

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
      canvas.add(rect);
      canvas.setActiveObject(rect);
    } else if (tool === "circle") {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: "transparent",
        stroke: activeColor,
        strokeWidth: 3,
        radius: 50,
      });
      canvas.add(circle);
      canvas.setActiveObject(circle);
    } else if (tool === "text" && textInput) {
      const text = new FabricText(textInput, {
        left: 100,
        top: 100,
        fill: activeColor,
        fontSize: 24,
        fontFamily: "Arial",
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      setTextInput("");
    }
  };

  const handleUndo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (objects.length > 0) {
      canvas.remove(objects[objects.length - 1]);
    }
  };

  const handleClear = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    objects.forEach(obj => canvas.remove(obj));
    canvas.renderAll();
  };

  const handleSave = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    setSaving(true);
    try {
      const annotationsJson = canvas.toJSON();

      const dataUrl = canvas.toDataURL({
        format: "png",
        quality: 1,
        multiplier: 2,
      });

      const response = await fetch(dataUrl);
      const blob = await response.blob();

      const annotatedPath = `${claimId}/photos/annotated_${photo.id}.png`;
      const { error: uploadError } = await supabase.storage
        .from("claim-files")
        .upload(annotatedPath, blob, { upsert: true });

      if (uploadError) throw uploadError;

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

  const handleClose = () => {
    cleanup();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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
                disabled={!imageLoaded}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === "rectangle" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => handleToolClick("rectangle")}
                title="Rectangle"
                disabled={!imageLoaded}
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === "circle" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => handleToolClick("circle")}
                title="Circle"
                disabled={!imageLoaded}
              >
                <CircleIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === "select" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setActiveTool("select")}
                title="Select"
                disabled={!imageLoaded}
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
                disabled={!imageLoaded}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleToolClick("text")}
                disabled={!textInput || !imageLoaded}
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
                  disabled={!imageLoaded}
                />
              ))}
            </div>

            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={handleUndo} title="Undo" disabled={!imageLoaded}>
                <Undo className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleClear} title="Clear All" disabled={!imageLoaded}>
                <Eraser className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Canvas Container */}
          <div className="border rounded-lg overflow-hidden bg-muted flex justify-center items-center min-h-[300px]">
            {isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span>Loading image...</span>
              </div>
            )}
            <div 
              ref={containerRef} 
              className={isLoading ? "hidden" : "flex justify-center"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !imageLoaded}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Annotations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
