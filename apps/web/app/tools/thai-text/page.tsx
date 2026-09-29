import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThaiTextApp } from "@/components/tools/ThaiTextApp";
import { ToolShell } from "@/components/tools/ToolShell";
import { getProjects } from "@/lib/content";

const PATH = "/tools/thai-text/";
const find = () => getProjects().find((p) => p.app === PATH);

export function generateMetadata(): Metadata {
  const p = find();
  return p ? { title: p.title.en, description: p.summary.en } : {};
}

export default function Page() {
  const project = find();
  if (!project) notFound();
  return (
    <ToolShell project={project}>
      <ThaiTextApp />
    </ToolShell>
  );
}
