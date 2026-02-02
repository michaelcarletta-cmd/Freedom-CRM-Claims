import { AppLayout } from "@/components/AppLayout";
import { DarwinOperationsCenter } from "@/components/dashboard/DarwinOperationsCenter";
import { Bot } from "lucide-react";

const DarwinOperations = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Darwin Operations Center</h1>
          <p className="text-muted-foreground">
            Monitor and control Darwin's autonomous claim management
          </p>
        </div>
      </div>

      <DarwinOperationsCenter />
    </div>
  );
};

export default DarwinOperations;
