import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronLeft, ChevronRight, FileSignature, Loader2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PacketField {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "signature" | "date" | "text" | "checkbox";
  required: boolean;
  label: string | null;
  value_text?: string | null;
  value_bool?: boolean | null;
  value_asset_path?: string | null;
}

interface PacketResponse {
  signer: {
    id: string;
    request_id: string;
    name: string;
    email: string;
    signing_order: number;
    status: string;
    signed_at: string | null;
    expires_at: string | null;
  };
  request: {
    id: string;
    claim_id: string;
    source_type: "uploaded_pdf" | "generated";
    draft_pdf_path: string | null;
    final_pdf_path: string | null;
    status: string;
    claim?: {
      claim_number: string | null;
      policyholder_name: string | null;
    };
  };
  can_sign: boolean;
  pdf_url: string;
  fields: PacketField[];
}

export default function Sign() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [packet, setPacket] = useState<PacketResponse | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [checkboxValues, setCheckboxValues] = useState<Record<string, boolean>>({});
  const [signatureTouched, setSignatureTouched] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(false);

  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const drawingRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) {
      setError("Missing signing token");
      setLoading(false);
      return;
    }

    const fetchPacket = async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("signature_get_packet", {
          body: { token },
        });

        if (invokeError) {
          throw new Error(invokeError.message || "Failed to load packet");
        }
        if (data?.error) {
          throw new Error(data.error);
        }

        const packetData = data as PacketResponse;
        setPacket(packetData);
        setCompleted(packetData.signer.status === "signed");

        const textSeed: Record<string, string> = {};
        const boolSeed: Record<string, boolean> = {};
        packetData.fields.forEach((field) => {
          if ((field.type === "text" || field.type === "date") && field.value_text) {
            textSeed[field.id] = field.value_text;
          }
          if (field.type === "date" && !textSeed[field.id]) {
            textSeed[field.id] = new Date().toISOString().slice(0, 10);
          }
          if (field.type === "checkbox" && typeof field.value_bool === "boolean") {
            boolSeed[field.id] = field.value_bool;
          }
        });
        setTextValues(textSeed);
        setCheckboxValues(boolSeed);
      } catch (err: any) {
        const message = err.message || "Invalid or expired signing link";
        setError(message);
        toast({
          title: "Unable to open signing packet",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPacket();
  }, [token, toast]);

  const pageFields = useMemo(
    () => (packet?.fields || []).filter((field) => field.page === currentPage),
    [packet?.fields, currentPage],
  );

  const getCanvasPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (fieldId: string, event: any) => {
    const canvas = canvasRefs.current[fieldId];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawingRef.current[fieldId] = true;
    const point = getCanvasPoint(canvas, event.clientX, event.clientY);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    setSignatureTouched((prev) => ({ ...prev, [fieldId]: true }));
  };

  const draw = (fieldId: string, event: any) => {
    if (!drawingRef.current[fieldId]) return;
    const canvas = canvasRefs.current[fieldId];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const point = getCanvasPoint(canvas, event.clientX, event.clientY);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const stopDrawing = (fieldId: string) => {
    drawingRef.current[fieldId] = false;
  };

  const clearSignature = (fieldId: string) => {
    const canvas = canvasRefs.current[fieldId];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureTouched((prev) => ({ ...prev, [fieldId]: false }));
  };

  const submitSignature = async () => {
    if (!token || !packet) return;
    if (!packet.can_sign) {
      toast({
        title: "Signing order enforced",
        description: "Please wait until previous signer(s) complete.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const fieldValues = packet.fields.map((field) => {
        if (field.type === "signature") {
          const canvas = canvasRefs.current[field.id];
          const signatureBase64 = signatureTouched[field.id] && canvas
            ? canvas.toDataURL("image/png")
            : null;
          return {
            field_id: field.id,
            signature_base64: signatureBase64,
          };
        }

        if (field.type === "checkbox") {
          return {
            field_id: field.id,
            value_bool: !!checkboxValues[field.id],
          };
        }

        return {
          field_id: field.id,
          value_text: textValues[field.id] || "",
        };
      });

      const { data, error: invokeError } = await supabase.functions.invoke("signature_submit", {
        body: {
          token,
          fieldValues,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || "Failed to submit signature");
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      setCompleted(true);
      toast({
        title: "Signature saved",
        description: data?.all_signed
          ? "All signers completed. Final signed PDF generated."
          : "Your signature has been recorded.",
      });
    } catch (err: any) {
      toast({
        title: "Unable to submit",
        description: err.message || "Submission failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !packet) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>
              {error || "This signing link is invalid or expired."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Check className="w-6 h-6 text-green-600" />
              <CardTitle>Document Signed</CardTitle>
            </div>
            <CardDescription>
              Thank you. Your response has been captured successfully.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-muted/30">
      <div className="max-w-6xl mx-auto grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5" />
                <CardTitle>Review and Sign</CardTitle>
              </div>
              {numPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} / {numPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.min(numPages, page + 1))}
                    disabled={currentPage >= numPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="flex justify-center">
              <div className="relative inline-block">
                <Document
                  file={packet.pdf_url}
                  onLoadSuccess={({ numPages: loadedPages }) => {
                    setNumPages(loadedPages);
                  }}
                >
                  <Page
                    pageNumber={currentPage}
                    width={760}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>

                <div className="absolute inset-0">
                  {pageFields.map((field) => (
                    <div
                      key={field.id}
                      className="absolute border border-primary/60 bg-background/85 rounded p-1 overflow-hidden"
                      style={{
                        left: `${field.x * 100}%`,
                        top: `${field.y * 100}%`,
                        width: `${field.w * 100}%`,
                        height: `${field.h * 100}%`,
                      }}
                    >
                      {field.type === "signature" && (
                        <div className="h-full w-full flex flex-col gap-1">
                          <canvas
                            ref={(element) => {
                              canvasRefs.current[field.id] = element;
                            }}
                            width={Math.max(140, Math.round(field.w * 760))}
                            height={Math.max(45, Math.round(field.h * 900))}
                            className="w-full h-full border rounded bg-white touch-none"
                            onPointerDown={(event) => startDrawing(field.id, event)}
                            onPointerMove={(event) => draw(field.id, event)}
                            onPointerUp={() => stopDrawing(field.id)}
                            onPointerLeave={() => stopDrawing(field.id)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => clearSignature(field.id)}
                          >
                            Clear
                          </Button>
                        </div>
                      )}

                      {(field.type === "text" || field.type === "date") && (
                        <Input
                          type={field.type === "date" ? "date" : "text"}
                          className="h-full text-xs"
                          value={textValues[field.id] || ""}
                          onChange={(event) =>
                            setTextValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
                        />
                      )}

                      {field.type === "checkbox" && (
                        <label className="h-full w-full flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!checkboxValues[field.id]}
                            onChange={(event) =>
                              setCheckboxValues((prev) => ({ ...prev, [field.id]: event.target.checked }))}
                            className="w-4 h-4"
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signer Details</CardTitle>
            <CardDescription>
              Claim #{packet.request.claim?.claim_number || packet.request.claim_id.slice(0, 8)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Signer</Label>
              <p className="text-sm font-medium">{packet.signer.name}</p>
              <p className="text-xs text-muted-foreground">{packet.signer.email}</p>
            </div>

            {!packet.can_sign && (
              <div className="p-3 rounded border border-yellow-400/60 bg-yellow-50 text-yellow-800 text-sm">
                Waiting on a previous signer in the sequence.
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Required fields</Label>
              <ul className="text-sm space-y-1">
                {packet.fields.map((field) => (
                  <li key={field.id}>
                    • {field.label || field.type} {field.required ? "(required)" : "(optional)"}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              className="w-full"
              onClick={submitSignature}
              disabled={submitting || !packet.can_sign}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Signature"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
