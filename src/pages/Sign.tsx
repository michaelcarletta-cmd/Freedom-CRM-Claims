import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileSignature, Check } from "lucide-react";

export default function Sign() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();
  
  const [signer, setSigner] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [drawingFields, setDrawingFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (token) {
      fetchSignerData();
    }
  }, [token]);

  const fetchSignerData = async () => {
    try {
      const { data: signerData, error: signerError } = await supabase
        .from("signature_signers")
        .select(`
          *,
          signature_requests(*)
        `)
        .eq("access_token", token)
        .maybeSingle();

      if (signerError) throw signerError;
      
      if (!signerData) {
        throw new Error("Signature request not found or link has expired");
      }
      
      if (signerData.status === "signed") {
        setSigned(true);
      }
      
      setSigner(signerData);
      setRequest(signerData.signature_requests);

      // Get document URL via backend function (works for public signers)
      const { data: urlData, error: urlError } = await supabase.functions.invoke(
        "get-signature-document",
        { body: { token } }
      );

      if (urlError || !urlData?.signedUrl) {
        console.error("Error fetching signed URL from function", urlError);
      } else {
        setDocumentUrl(urlData.signedUrl);
      }

    } catch (error: any) {
      toast({
        title: "Invalid or expired link",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const startDrawing = (fieldId: string, e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawingFields(prev => ({ ...prev, [fieldId]: true }));
    const canvas = canvasRefs.current[fieldId];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (fieldId: string, e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingFields[fieldId]) return;
    const canvas = canvasRefs.current[fieldId];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = (fieldId: string) => {
    setDrawingFields(prev => ({ ...prev, [fieldId]: false }));
  };

  const clearSignature = (fieldId: string) => {
    const canvas = canvasRefs.current[fieldId];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSign = async () => {
    // Get placed fields for this signer
    const fields = (request.field_data || []).filter(
      (f: any) => f.signerIndex === signer.signing_order - 1
    );

    // Collect signature data and field values
    const collectedValues: Record<string, any> = {};
    for (const field of fields) {
      if (field.type === "signature") {
        const canvas = canvasRefs.current[field.id];
        if (canvas) {
          collectedValues[field.id] = canvas.toDataURL();
        }
      } else {
        collectedValues[field.id] = fieldValues[field.id] || "";
      }
    }
    
    setSigning(true);
    try {
      const { error } = await supabase
        .from("signature_signers")
        .update({
          status: "signed",
          signed_at: new Date().toISOString(),
          field_values: collectedValues,
        })
        .eq("id", signer.id);

      if (error) throw error;

      // Check if all signers have signed
      const { data: allSigners } = await supabase
        .from("signature_signers")
        .select("status")
        .eq("signature_request_id", request.id);

      const allSigned = allSigners?.every((s) => s.status === "signed");

      if (allSigned) {
        await supabase
          .from("signature_requests")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", request.id);
      } else {
        await supabase
          .from("signature_requests")
          .update({ status: "in_progress" })
          .eq("id", request.id);
      }

      setSigned(true);
      toast({ title: "Document signed successfully" });
    } catch (error: any) {
      toast({
        title: "Failed to sign",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!signer || !request) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>
              This signature link is invalid or has expired.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Check className="w-6 h-6 text-green-600" />
              <CardTitle>Document Signed</CardTitle>
            </div>
            <CardDescription>
              Thank you! Your signature has been recorded.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSignature className="w-6 h-6" />
            <CardTitle>Sign Document</CardTitle>
          </div>
          <CardDescription>
            {request.document_name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">Signer:</span> {signer.signer_name}
            </p>
            <p className="text-sm text-muted-foreground">
              Please review the document and sign below
            </p>
          </div>

          {documentUrl && (
            <div className="border rounded-lg overflow-hidden bg-muted">
              <iframe
                src={documentUrl}
                className="w-full h-96"
                title="Document Preview"
              />
            </div>
          )}

          <div className="space-y-4">
            <Label>Complete Required Fields</Label>
            {(request.field_data || [])
              .filter((field: any) => field.signerIndex === signer.signing_order - 1)
              .map((field: any) => (
                <div key={field.id} className="space-y-2">
                  <Label className="text-sm font-medium">{field.label}</Label>
                  {field.type === "signature" ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Draw your signature using your mouse or touchscreen
                      </p>
                      <div className="border-2 border-dashed rounded-lg p-2 bg-background">
                        <canvas
                          ref={(el) => (canvasRefs.current[field.id] = el)}
                          width={400}
                          height={120}
                          className="w-full border rounded cursor-crosshair bg-white"
                          onMouseDown={(e) => startDrawing(field.id, e)}
                          onMouseMove={(e) => draw(field.id, e)}
                          onMouseUp={() => stopDrawing(field.id)}
                          onMouseLeave={() => stopDrawing(field.id)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => clearSignature(field.id)}
                      >
                        Clear Signature
                      </Button>
                    </div>
                  ) : field.type === "date" ? (
                    <Input
                      type="date"
                      value={fieldValues[field.id] || ""}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                      className="bg-background"
                    />
                  ) : (
                    <Input
                      type="text"
                      value={fieldValues[field.id] || ""}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                      placeholder="Enter text"
                      className="bg-background"
                    />
                  )}
                </div>
              ))}
          </div>

          <Button onClick={handleSign} disabled={signing} className="w-full">
            {signing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing...
              </>
            ) : (
              "Complete Signature"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
