import type { MetadataRoute } from "next";
import { getProjects } from "@/lib/content";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), priority: 1 },
    { url: absoluteUrl("/projects/"), priority: 0.8 },
    ...getProjects().map((p) => ({ url: absoluteUrl(`/projects/${p.slug}/`), priority: 0.6 })),
  ];
}
