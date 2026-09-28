import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SandboxApp } from "@/components/lab/SandboxApp";
import { LabShell } from "@/components/lab/LabShell";
import { getProject } from "@/lib/content";

const SLUG = "syscall-sandbox";

export function generateMetadata(): Metadata {
  const p = getProject(SLUG);
  return p ? { title: p.title.en, description: p.summary.en } : {};
}

export default function Page() {
  const project = getProject(SLUG);
  if (!project) notFound();
  return (
    <LabShell project={project}>
      <SandboxApp />
    </LabShell>
  );
}
