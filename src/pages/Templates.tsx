import { TemplatesSettings } from "@/components/settings/TemplatesSettings";

export default function Templates() {
  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Templates</h1>
        <p className="text-muted-foreground text-sm md:text-base">Manage document templates for your claims</p>
      </div>
      <TemplatesSettings />
    </div>
  );
}