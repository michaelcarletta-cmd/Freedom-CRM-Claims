import { WorkspaceList } from "@/components/workspaces/WorkspaceList";

export default function Workspaces() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Shared Workspaces</h1>
        <p className="text-muted-foreground">
          Collaborate with partner companies on shared claims and files
        </p>
      </div>
      
      <WorkspaceList />
    </div>
  );
}
