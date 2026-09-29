import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlashcardsApp } from "@/components/tools/FlashcardsApp";
import { ToolShell } from "@/components/tools/ToolShell";
import { getProjects } from "@/lib/content";

const PATH = "/tools/flashcards/";
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
      <FlashcardsApp />
    </ToolShell>
  );
}
