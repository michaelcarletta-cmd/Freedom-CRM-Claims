import { TemplatesSettings } from "@/components/settings/TemplatesSettings";

export default function Templates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Templates</h1>
        <p className="text-muted-foreground">Manage document templates for your claims</p>
      </div>
      <TemplatesSettings />
    </div>
  );
}
