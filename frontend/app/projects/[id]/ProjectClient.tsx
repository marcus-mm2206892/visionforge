"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ImageIcon,
  Download,
  Trash2,
  Sparkles,
  ArrowLeft,
  Images,
  Check,
  Wand2,
  Pencil,
  MoreVertical,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  {
    id: "gpt-image-1.5",
    label: "GPT Image 1.5",
    costHint: "Best quality, most expensive",
  },
] as const;

const GEMINI_MODELS = [
  {
    id: "imagen-4.0-generate-001",
    label: "Imagen 4",
    costHint: "Standard quality",
  },
  {
    id: "imagen-4.0-ultra-generate-001",
    label: "Imagen 4 Ultra",
    costHint: "Best quality",
  },
  {
    id: "imagen-4.0-fast-generate-001",
    label: "Imagen 4 Fast",
    costHint: "Cheaper, faster",
  },
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
  master_prompt: string | null;
  task_type: string;
  created_at: string;
  updated_at: string;
};

const projectsBase = `${API_URL}/api/v1/projects`;
const PROMPT_MAX_LENGTH = 5000;

export function ProjectClient({ project }: { project: Project }) {
  const router = useRouter();
  const [projectData, setProjectData] = useState(project);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(project.name);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescValue, setEditDescValue] = useState(project.description ?? "");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [masterPrompt, setMasterPrompt] = useState(project.master_prompt ?? "");
  const [masterPromptEditable, setMasterPromptEditable] = useState(
    !project.master_prompt,
  );
  const [masterPromptOpen, setMasterPromptOpen] = useState(!project.master_prompt);
  const [savingMasterPrompt, setSavingMasterPrompt] = useState(false);
  const [scenePrompt, setScenePrompt] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [model, setModel] = useState<string>("gpt-image-1-mini");

  const activeModels = provider === "openai" ? IMAGE_MODELS : GEMINI_MODELS;

  function handleProviderChange(p: "openai" | "gemini") {
    setProvider(p);
    setModel(p === "openai" ? "gpt-image-1-mini" : "imagen-4.0-generate-001");
  }
  const [images, setImages] = useState<{ filename: string; url: string }[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<
    "preparing" | "generating"
  >("preparing");
  const [genError, setGenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sceneMode, setSceneMode] = useState<"single" | "batch">("single");
  const [batchSceneText, setBatchSceneText] = useState("");
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    scene: string;
  } | null>(null);
  const [batchErrors, setBatchErrors] = useState<
    { index: number; error: string }[]
  >([]);
  const stopBatchRef = useRef(false);

  const projectId = projectData.id;
  const base = `${API_URL}/api/v1/projects/${projectId}/images`;
  const masterPromptLength = masterPrompt.length;
  const scenePromptLength = scenePrompt.length;
  const isMasterPromptTooLong = masterPromptLength > PROMPT_MAX_LENGTH;
  const isScenePromptTooLong = scenePromptLength > PROMPT_MAX_LENGTH;

  function parseBatchPrompts(text: string): string[] {
    return text
      .split(/\n[ \t]*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const parsedBatchPrompts = parseBatchPrompts(batchSceneText);

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
    if (!masterPrompt.trim()) {
      setGenError("Master prompt is required.");
      return;
    }
    if (!scenePrompt.trim()) {
      setGenError("Scene prompt is required.");
      return;
    }
    if (isMasterPromptTooLong) {
      setGenError(`Master prompt must be ${PROMPT_MAX_LENGTH} characters or less.`);
      return;
    }
    if (isScenePromptTooLong) {
      setGenError(`Scene prompt must be ${PROMPT_MAX_LENGTH} characters or less.`);
      return;
    }
    setGenerating(true);
    setGenerationStep("preparing");
    setGenError(null);
    await new Promise((r) => setTimeout(r, 400));
    setGenerationStep("generating");
    try {
      await postGenerate(scenePrompt);
      await fetchImages();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
      setGenerationStep("preparing");
    }
  }

  async function postGenerate(scene: string): Promise<void> {
    const res = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        master_prompt: masterPrompt,
        scene_prompt: scene,
        count: imageCount,
        provider,
        model,
        size: "1536x1024",
        aspect_ratio: "2:1",
        quality: "low",
        output_format: "png",
      }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const msg = (() => {
        if (typeof detail?.detail === "string") return detail.detail;
        if (Array.isArray(detail?.detail)) {
          const first = detail.detail[0];
          if (first?.msg) {
            const loc = Array.isArray(first.loc) ? first.loc.join(".") : undefined;
            return loc ? `${first.msg} (${loc})` : first.msg;
          }
        }
        if (detail?.detail?.msg) return detail.detail.msg;
        return "Generation failed";
      })();
      throw new Error(msg);
    }
    await res.json();
  }

  async function handleBatchRun(e: React.FormEvent) {
    e.preventDefault();
    if (!masterPrompt.trim()) {
      setGenError("Master prompt is required.");
      return;
    }
    const prompts = parseBatchPrompts(batchSceneText);
    if (prompts.length === 0) {
      setGenError("Paste at least one scene prompt.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    setBatchErrors([]);
    stopBatchRef.current = false;

    for (let i = 0; i < prompts.length; i++) {
      if (stopBatchRef.current) break;
      const scene = prompts[i];
      setBatchProgress({ current: i + 1, total: prompts.length, scene });
      setGenerationStep("preparing");
      await new Promise((r) => setTimeout(r, 300));
      setGenerationStep("generating");
      try {
        await postGenerate(scene);
        await fetchImages();
      } catch (err) {
        setBatchErrors((prev) => [
          ...prev,
          { index: i + 1, error: err instanceof Error ? err.message : "Failed" },
        ]);
      }
    }

    setGenerating(false);
    setBatchProgress(null);
    setGenerationStep("preparing");
  }

  async function handleDeleteImage(filename: string) {
    try {
      const res = await fetch(`${base}/files/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setImages((prev) => prev.filter((img) => img.filename !== filename));
    } catch {
      // ignore
    }
  }

  async function patchProject(updates: {
    name?: string;
    description?: string | null;
    master_prompt?: string | null;
    task_type?: string;
  }) {
    setSavingProject(true);
    try {
      const res = await fetch(`${projectsBase}/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      setProjectData(updated);
      return true;
    } catch {
      return false;
    } finally {
      setSavingProject(false);
    }
  }

  async function handleSaveName() {
    const name = editNameValue.trim();
    if (!name || name === projectData.name) {
      setEditingName(false);
      return;
    }
    const ok = await patchProject({ name });
    if (ok) {
      setEditNameValue(name);
      setEditingName(false);
    }
  }

  async function handleSaveDescription() {
    const description = editDescValue.trim() || null;
    if (description === (projectData.description ?? "")) {
      setEditingDescription(false);
      return;
    }
    const ok = await patchProject({ description });
    if (ok) {
      setEditDescValue(description ?? "");
      setEditingDescription(false);
    }
  }

  async function handleTaskTypeChange(newTaskType: string) {
    if (newTaskType === projectData.task_type) return;
    await patchProject({ task_type: newTaskType });
  }

  async function handleSaveMasterPromptAsDefault() {
    setSavingMasterPrompt(true);
    try {
      const ok = await patchProject({
        master_prompt: masterPrompt.trim() || null,
      });
      if (ok) setMasterPromptEditable(false);
    } finally {
      setSavingMasterPrompt(false);
    }
  }

  function handleRevertMasterPrompt() {
    setMasterPrompt(projectData.master_prompt ?? "");
    setMasterPromptEditable(false);
  }

  async function handleDeleteProject() {
    if (
      !confirm(
        "Delete this project? This cannot be undone. Generated images will be removed.",
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`${projectsBase}/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/dashboard");
    } catch {
      setDeleting(false);
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
      a.download = `visionforge-${projectData.name.replace(/\s+/g, "-")}-export.zip`;
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {editingName ? (
            <div className="flex flex-1 min-w-0 max-w-md items-center gap-2">
              <Input
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                className="text-lg font-bold h-9"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSaveName}
                disabled={savingProject || !editNameValue.trim()}
              >
                {savingProject ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditingName(false);
                  setEditNameValue(projectData.name);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {projectData.name}
              </h1>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEditingName(true);
                  setEditNameValue(projectData.name);
                }}
                aria-label="Rename project"
              >
                <Pencil className="size-4" />
              </Button>
            </>
          )}
          <Select
            value={projectData.task_type}
            onValueChange={(v) => v != null && handleTaskTypeChange(v)}
          >
            <SelectTrigger className="w-auto h-8 gap-1 border-none bg-secondary/50 px-2.5 text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative ml-auto">
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => setOptionsOpen((o) => !o)}
              aria-label="Project options"
            >
              <MoreVertical className="size-4" />
            </Button>
            {optionsOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setOptionsOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-border bg-card py-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => {
                      setOptionsOpen(false);
                      setEditingDescription(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    {projectData.description
                      ? "Edit description"
                      : "Add description"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setOptionsOpen(false);
                      handleDeleteProject();
                    }}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Delete project
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {editingDescription ? (
          <div className="flex gap-2 max-w-xl">
            <Textarea
              value={editDescValue}
              onChange={(e) => setEditDescValue(e.target.value)}
              placeholder="Short description (optional)"
              rows={2}
              className="resize-none"
            />
            <div className="flex flex-col gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSaveDescription}
                disabled={savingProject}
              >
                {savingProject ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditingDescription(false);
                  setEditDescValue(projectData.description ?? "");
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            {projectData.description ? (
              projectData.description
            ) : (
              <button
                type="button"
                className="text-muted-foreground/70 hover:text-muted-foreground underline"
                onClick={() => setEditingDescription(true)}
              >
                Add description
              </button>
            )}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Created {new Date(projectData.created_at).toLocaleString()}
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
            Master prompt sets dataset context; scene prompt describes the
            specific scene. Choose model below. Up to 20 images per run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {generating ? (
            <div className="rounded-lg border border-border bg-muted/30 p-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Wand2 className="size-5 animate-pulse text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {batchProgress
                          ? `Batch — prompt ${batchProgress.current} of ${batchProgress.total}`
                          : "Generating images"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {imageCount} {imageCount === 1 ? "image" : "images"}{" "}
                        with{" "}
                        {activeModels.find((m) => m.id === model)?.label ??
                          model}
                      </p>
                    </div>
                  </div>
                  {batchProgress && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        stopBatchRef.current = true;
                      }}
                    >
                      Stop
                    </Button>
                  )}
                </div>

                {batchProgress && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.round(
                          ((batchProgress.current - 1) / batchProgress.total) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {generationStep === "preparing" ? (
                      <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">Preparing prompt</p>
                      <p className="text-xs text-muted-foreground">
                        Combining master + scene with synthetic dataset
                        guidelines
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {generationStep === "generating" ? (
                      <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 bg-muted/50">
                        <span className="text-xs text-muted-foreground">2</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {generationStep === "generating"
                          ? "Generating images…"
                          : "Send to model"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        This may take a minute depending on model and count
                      </p>
                    </div>
                  </div>
                </div>

                {!batchProgress && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                      style={{
                        width: generationStep === "preparing" ? "30%" : "85%",
                      }}
                    />
                  </div>
                )}

                <details className="rounded-md border border-border bg-background/50 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    View prompt summary
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Master:
                      </span>
                      <p className="mt-0.5 line-clamp-2 text-foreground">
                        {masterPrompt}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Scene:
                      </span>
                      <p className="mt-0.5 line-clamp-2 text-foreground">
                        {batchProgress ? batchProgress.scene : scenePrompt}
                      </p>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          ) : (
            <form
              onSubmit={sceneMode === "batch" ? handleBatchRun : handleGenerate}
              className="space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-medium leading-none hover:text-foreground text-foreground"
                    onClick={() => setMasterPromptOpen((o) => !o)}
                    aria-expanded={masterPromptOpen}
                  >
                    {masterPromptOpen ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                    Master prompt (dataset context)
                  </button>
                  {masterPromptOpen && !masterPromptEditable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-muted-foreground"
                      onClick={() => setMasterPromptEditable(true)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  )}
                </div>
                {masterPromptOpen && (
                  <>
                    {masterPromptEditable ? (
                  <div className="space-y-2">
                    <Textarea
                      id="master-prompt"
                      value={masterPrompt}
                      onChange={(e) => setMasterPrompt(e.target.value)}
                      rows={18}
                      placeholder="e.g. Realistic disaster rescue dataset, high realism, natural lighting."
                      maxLength={PROMPT_MAX_LENGTH}
                      required
                      className="resize-none"
                    />
                    <p
                      className={`text-xs ${isMasterPromptTooLong ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {masterPromptLength}/{PROMPT_MAX_LENGTH}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleSaveMasterPromptAsDefault}
                        disabled={savingMasterPrompt || !masterPrompt.trim()}
                      >
                        {savingMasterPrompt ? (
                          <Loader2 className="mr-2 size-3.5 animate-spin" />
                        ) : null}
                        Save as project default
                      </Button>
                      {projectData.master_prompt != null &&
                        projectData.master_prompt !== "" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRevertMasterPrompt}
                          >
                            Revert to saved
                          </Button>
                        )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground whitespace-pre-wrap">
                    {masterPrompt || (
                      <span className="text-muted-foreground">
                        No master prompt saved. Click “Edit” to add one.
                      </span>
                    )}
                  </div>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Scene prompt</Label>
                  <div className="flex rounded-md border border-border text-xs font-medium overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSceneMode("single")}
                      className={`px-3 py-1.5 transition-colors ${
                        sceneMode === "single"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      Single
                    </button>
                    <button
                      type="button"
                      onClick={() => setSceneMode("batch")}
                      className={`px-3 py-1.5 transition-colors ${
                        sceneMode === "batch"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      Batch
                    </button>
                  </div>
                </div>

                {sceneMode === "single" ? (
                  <>
                    <Textarea
                      id="scene-prompt"
                      value={scenePrompt}
                      onChange={(e) => setScenePrompt(e.target.value)}
                      rows={3}
                      placeholder="e.g. Ground robot camera, collapsed building, victim hand in rubble."
                      maxLength={PROMPT_MAX_LENGTH}
                      required
                      className="resize-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Be specific; this field is required.
                      </p>
                      <p
                        className={`text-xs ${isScenePromptTooLong ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {scenePromptLength}/{PROMPT_MAX_LENGTH}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Textarea
                      id="batch-scene-prompts"
                      value={batchSceneText}
                      onChange={(e) => setBatchSceneText(e.target.value)}
                      rows={12}
                      placeholder={`Paste scene prompts here — separate each prompt with a blank line.\n\nExample:\nDark collapsed living room at night with broken walls and scattered debris...\n\nOutdoor nighttime building collapse with open sky and minimal moonlight...`}
                      className="resize-y font-mono text-xs"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Separate prompts with a blank line. Each prompt runs{" "}
                        <span className="font-medium text-foreground">
                          {imageCount} {imageCount === 1 ? "image" : "images"}
                        </span>{" "}
                        sequentially.
                      </p>
                      {parsedBatchPrompts.length > 0 && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {parsedBatchPrompts.length}{" "}
                          {parsedBatchPrompts.length === 1
                            ? "prompt"
                            : "prompts"}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(v) =>
                    v != null && handleProviderChange(v as "openai" | "gemini")
                  }
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">
                      <span className="font-medium">OpenAI</span>
                      <span className="ml-2 text-muted-foreground">
                        — GPT Image models
                      </span>
                    </SelectItem>
                    <SelectItem value="gemini">
                      <span className="font-medium">Google Gemini</span>
                      <span className="ml-2 text-muted-foreground">
                        — Imagen 3 models
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={model}
                  onValueChange={(v) => v != null && setModel(v)}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="font-medium">{m.label}</span>
                        <span className="ml-2 text-muted-foreground">
                          — {m.costHint}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {provider === "openai"
                    ? "Mini is cheapest; 1.5 is best quality and most expensive."
                    : "Imagen 3 Fast is cheaper; Imagen 3 offers higher quality."}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="image-count">Number of images</Label>
                  <Input
                    id="image-count"
                    type="number"
                    min={1}
                    max={20}
                    value={imageCount}
                    onChange={(e) =>
                      setImageCount(
                        Math.min(
                          20,
                          Math.max(1, parseInt(e.target.value, 10) || 1),
                        ),
                      )
                    }
                    className="w-20"
                  />
                </div>
                {sceneMode === "single" ? (
                  <Button
                    type="submit"
                    disabled={
                      generating ||
                      !masterPrompt.trim() ||
                      !scenePrompt.trim() ||
                      isMasterPromptTooLong ||
                      isScenePromptTooLong
                    }
                  >
                    <ImageIcon className="mr-2 size-4" />
                    Generate images
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      generating ||
                      !masterPrompt.trim() ||
                      parsedBatchPrompts.length === 0
                    }
                  >
                    <ImageIcon className="mr-2 size-4" />
                    Run{" "}
                    {parsedBatchPrompts.length > 0
                      ? `${parsedBatchPrompts.length} prompt${parsedBatchPrompts.length === 1 ? "" : "s"}`
                      : "batch"}
                  </Button>
                )}
              </div>
            </form>
          )}
          {genError && <p className="text-sm text-destructive">{genError}</p>}
          {batchErrors.length > 0 && !generating && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <p className="text-xs font-medium text-destructive">
                {batchErrors.length} prompt{batchErrors.length === 1 ? "" : "s"} failed:
              </p>
              {batchErrors.map((e) => (
                <p key={e.index} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">#{e.index}</span>{" "}
                  — {e.error}
                </p>
              ))}
            </div>
          )}
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
              {exporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
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
            <p className="py-8 text-center text-muted-foreground">
              No images yet. Generate some above.
            </p>
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
