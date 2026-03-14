import { notFound } from "next/navigation";
import { ProjectClient } from "./ProjectClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Project = {
  id: number;
  name: string;
  description: string | null;
  task_type: string;
  created_at: string;
  updated_at: string;
};

async function getProject(id: string): Promise<Project | null> {
  const res = await fetch(`${API_URL}/api/v1/projects/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return <ProjectClient project={project} />;
}
