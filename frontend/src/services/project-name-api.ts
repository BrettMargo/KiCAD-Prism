export interface ProjectNameResponse {
  display_name?: string;
  fallback_name: string;
}

export interface UpdateProjectNameRequest {
  display_name: string;
}

export interface UpdateProjectNameResponse {
  display_name: string;
  message: string;
}

export const projectNameAPI = {
  async getProjectName(projectId: string): Promise<ProjectNameResponse> {
    const response = await fetch(`/api/projects/${projectId}/name`);
    if (!response.ok) {
      throw new Error('Failed to fetch project name');
    }
    return response.json();
  },

  async updateProjectName(projectId: string, displayName: string): Promise<UpdateProjectNameResponse> {
    const response = await fetch(`/api/projects/${projectId}/name`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ display_name: displayName }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update project name');
    }
    return response.json();
  }
};
