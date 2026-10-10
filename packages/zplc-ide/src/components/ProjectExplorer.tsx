/** The Explorer tab: the file tree, and under it the declarations of the project and its library folders (IDE-023). */
import { ProjectDeclarations } from './ProjectDeclarations';
import { Sidebar } from './Sidebar';

export function ProjectExplorer() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1"><Sidebar /></div>
      <ProjectDeclarations />
    </div>
  );
}
