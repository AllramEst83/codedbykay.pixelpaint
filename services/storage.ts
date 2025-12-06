import { ProjectData } from "../types";

const STORAGE_KEY = "pixelpaint_projects";

export const getProjects = (): ProjectData[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load projects", e);
    return [];
  }
};

export const saveProject = (project: ProjectData) => {
  try {
    const projects = getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      projects[index] = project;
    } else {
      projects.unshift(project);
    }
    // Limit to last 5 to avoid storage quotas with base64 images
    const trimmed = projects.slice(0, 5); 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error("Failed to save project - likely storage quota exceeded", e);
    // We swallow the error so the UI flow doesn't break, 
    // though the project won't persist after refresh if storage is full.
  }
};

export const deleteProject = (id: string) => {
  try {
    const projects = getProjects().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error("Failed to delete project", e);
  }
};