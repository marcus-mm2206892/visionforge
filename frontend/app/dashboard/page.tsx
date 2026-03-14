import { DashboardClient } from "@/app/dashboard/DashboardClient";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="mt-1 text-muted-foreground">
          Create and manage datasets, then generate synthetic images with AI.
        </p>
      </div>
      <DashboardClient />
    </div>
  );
}
