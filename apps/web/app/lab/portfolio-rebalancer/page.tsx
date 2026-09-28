import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RebalancerApp } from "@/components/lab/RebalancerApp";
import { LabShell } from "@/components/lab/LabShell";
import { getProject } from "@/lib/content";

const SLUG = "portfolio-rebalancer";

export function generateMetadata(): Metadata {
  const p = getProject(SLUG);
  return p ? { title: p.title.en, description: p.summary.en } : {};
}

export default function Page() {
  const project = getProject(SLUG);
  if (!project) notFound();
  return (
    <LabShell project={project}>
      <RebalancerApp />
    </LabShell>
  );
}
