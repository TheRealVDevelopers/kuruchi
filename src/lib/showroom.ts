import type { Project } from "@/types";

/** The showroom name entered by Ola belongs to the project, not the owner. */
export function showroomName(project: Pick<Project, "name" | "site">) {
  return project.name.trim() || [project.site.city.trim(), "Showroom"].filter(Boolean).join(" ");
}

export function showroomWelcome(projects: Project[]) {
  if (projects.length === 1) return `Welcome, ${showroomName(projects[0])}`;
  return projects.length ? "Welcome to your showrooms" : "Welcome to your showroom";
}
