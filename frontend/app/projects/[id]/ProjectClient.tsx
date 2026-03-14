"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ImageIcon,
  Download,
  Trash2,
  Sparkles,
  ArrowLeft,
  Images,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const IMAGE_MODELS = [
  { id: "gpt-image-1-mini", label: "GPT Image 1 Mini", costHint: "Cheapest" },
  { id: "gpt-image-1", label: "GPT Image 1", costHint: "Balanced" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", costHint: "Best quality, most expensive" },
] as const;

const TASK_LABELS: Record<string, string> = {
  classification: "Classification",
  detection: "Detection",
  segmentation: "Segmentation",
  captioning: "Captioning / VLM",
};

type Project = {
  id: number;
  name: string;
  description: string | null;
  task_type: string;
  created_at: string;
  updated_at: string;
};

export function ProjectClient({ project }: { project: Project }) {
  const [masterPrompt, setMasterPrompt] = useState(
    "Realistic disaster rescue dataset for search and rescue training. Emergency environment, high realism, natural lighting."
  );
  const [scenePrompt, setScenePrompt] = useState(
    "Ground robot inspection camera perspective inside a collapsed building, a trapped victim's hand emerging from dusty rubble and broken concrete slabs, debris and twisted metal around, low camera height close to the ground."
  );
  const [imageCount, setImageCount] = useState(1);
  const [model, setModel] = useState<string>("gpt-image-1-mini");
  const [images, setImages] = useState<{ filename: string; url: string }[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const projectId = project.id;
  const base = `${API_URL}/api/v1/projects/${projectId}/images`;

  async function fetchImages() {
    setLoadingImages(true);
    try {
      const res = await fetch(base);
      if (!res.ok) return;
      const data = await res.json();
      setImages(data.images || []);
    } finally {
      setLoadingImages(false);
    }
  }

  useEffect(() => {
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- base depends on projectId
  }, [projectId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`${base}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master_prompt: masterPrompt,
          scene_prompt: scenePrompt,
          count: imageCount,
          model,
          size: "1024x1024",
          quality: "low",
          output_format: "png",
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        const msg = typeof detail?.detail === "string" ? detail.detail : detail?.detail?.msg || "Generation failed";
        throw new Error(msg);
      }
      await res.json();
      await fetchImages();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteImage(filename: string) {
    try {
      const res = await fetch(`${base}/files/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!res.ok) return;
      setImages((prev) => prev.filter((img) => img.filename !== filename));
    } catch {
      // ignore
    }
  }

  async function handleExport() {
    if (images.length === 0) return;
    setExporting(true);
    try {
      const res = await fetch(`${base}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenames: images.map((img) => img.filename) }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `visionforge-${project.name.replace(/\s+/g, "-")}-export.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Dashboard
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <Badge variant="secondary">{TASK_LABELS[project.task_type] ?? project.task_type}</Badge>
        </div>
        {project.description && (
          <p className="mt-2 text-muted-foreground">{project.description}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Created {new Date(project.created_at).toLocaleString()}
        </p>
      </div>

      {/* Generate */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <CardTitle>Generate</CardTitle>
          </div>
          <CardDescription>
            Master prompt sets dataset context; scene prompt describes the specific scene. Choose model below. Up to 5 images per run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="master-prompt">Master prompt (dataset context)</Label>
              <Textarea
                id="master-prompt"
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Realistic disaster rescue dataset, high realism, natural lighting."
                required
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scene-prompt">Scene prompt (specific scene)</Label>
              <Textarea
                id="scene-prompt"
                value={scenePrompt}
                onChange={(e) => setScenePrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Ground robot camera, collapsed building, victim hand in rubble."
                required
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={model} onValueChange={(v) => v != null && setModel(v)}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="font-medium">{m.label}</span>
                      <span className="ml-2 text-muted-foreground">— {m.costHint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Mini is cheapest; 1.5 is best quality and most expensive.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="image-count">Number of images</Label>
                <Input
                  id="image-count"
                  type="number"
                  min={1}
                  max={5}
                  value={imageCount}
                  onChange={(e) => setImageCount(Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="w-20"
                />
              </div>
              <Button type="submit" disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <ImageIcon className="mr-2 size-4" />
                    Generate images
                  </>
                )}
              </Button>
            </div>
          </form>
          {genError && <p className="text-sm text-destructive">{genError}</p>}
        </CardContent>
      </Card>

      {/* Gallery + Export */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Images className="size-5 text-muted-foreground" />
              <CardTitle>Gallery</CardTitle>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={exporting || images.length === 0}
            >
              {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              {exporting ? "Exporting…" : "Export ZIP"}
            </Button>
          </div>
          <CardDescription>
            Generated images for this project. Export downloads all as a ZIP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingImages ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No images yet. Generate some above.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <li
                  key={img.filename}
                  className="group relative overflow-hidden rounded-lg border border-border bg-card"
                >
                  <a
                    href={`${API_URL}${img.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${API_URL}${img.url}`}
                      alt={img.filename}
                      className="w-full object-cover transition-opacity group-hover:opacity-90"
                    />
                  </a>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 size-8 opacity-90 hover:opacity-100"
                    onClick={() => handleDeleteImage(img.filename)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
