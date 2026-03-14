import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Visionforge</h1>
      <p className="text-lg text-muted-foreground">
        Synthetic dataset generation for vision AI: prompt templating, batch generation, and ML-ready export.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Open dashboard
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
