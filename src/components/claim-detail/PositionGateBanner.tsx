import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock } from "lucide-react";
import { DeclaredPosition } from "@/hooks/useDeclaredPosition";

interface PositionGateBannerProps {
  position: DeclaredPosition | null;
  isLocked: boolean;
  loading: boolean;
  onOverride?: () => void;
  showOverride?: boolean;
}

export const PositionGateBanner = ({ position, isLocked, loading, onOverride, showOverride = true }: PositionGateBannerProps) => {
  if (loading || isLocked) return null;

  return (
    <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="text-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <strong>Declared Position not locked.</strong>{" "}
            {!position
              ? "Set your position in the Declared Position card above before generating carrier-facing outputs."
              : "Lock your position to ensure consistent, confident carrier-facing outputs."}
          </div>
          {showOverride && onOverride && (
            <Button variant="outline" size="sm" className="text-xs whitespace-nowrap border-yellow-500 text-yellow-700 hover:bg-yellow-100" onClick={onOverride}>
              <Lock className="h-3 w-3 mr-1" />
              Proceed Provisional
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};
