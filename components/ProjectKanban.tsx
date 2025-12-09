import React, { useState } from 'react';
import { Project, ProjectStage } from '../types';
import { Plus, Trash2, MoreVertical, ChevronDown, ChevronRight } from 'lucide-react';

interface ProjectKanbanProps {
  projects: Project[];
  onProjectClick: (project: Project) => void;
  onAddProject: () => void;
  onUpdateProjectStage: (projectId: string, newStage: ProjectStage) => void;
  onDeleteProject?: (projectId: string) => void;
}

const STAGES: ProjectStage[] = [
  '初次接触',
  '需求确认',
  '方案演示',
  '商务谈判',
  '签约',
  '实施',
  '品牌管理'
];

const STAGE_COLORS: Record<ProjectStage, string> = {
  '初次接触': 'bg-blue-100 text-blue-700 border-blue-200',
  '需求确认': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  '方案演示': 'bg-purple-100 text-purple-700 border-purple-200',
  '商务谈判': 'bg-orange-100 text-orange-700 border-orange-200',
  '签约': 'bg-green-100 text-green-700 border-green-200',
  '实施': 'bg-teal-100 text-teal-700 border-teal-200',
  '品牌管理': 'bg-indigo-100 text-indigo-700 border-indigo-200'
};

const ProjectKanban: React.FC<ProjectKanbanProps> = ({ projects, onProjectClick, onAddProject, onUpdateProjectStage, onDeleteProject }) => {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<ProjectStage>>(new Set());

  const handleDeleteClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setDeleteConfirmId(projectId);
    setMenuOpenId(null);
  };

  const confirmDelete = () => {
    if (deleteConfirmId && onDeleteProject) {
      onDeleteProject(deleteConfirmId);
    }
    setDeleteConfirmId(null);
  };

  const toggleStage = (stage: ProjectStage) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  };

  // Drag and Drop handling
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData('projectId', projectId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, stage: ProjectStage) => {
    e.preventDefault();
    const projectId = e.dataTransfer.getData('projectId');
    if (projectId) {
      onUpdateProjectStage(projectId, stage);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200 flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-800">项目看板</h2>
        <button
          onClick={onAddProject}
          className="bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 shadow-sm active:scale-95 transition-transform"
        >
          <Plus size={16} /> 新建项目
        </button>
      </div>

      {/* Vertical Stage List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {STAGES.map((stage) => {
          const stageProjects = projects.filter(p => p.stage === stage);
          const isCollapsed = collapsedStages.has(stage);
          const colorClass = STAGE_COLORS[stage];

          return (
            <div
              key={stage}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              {/* Stage Header */}
              <button
                onClick={() => toggleStage(stage)}
                className={`w-full p-3 flex items-center justify-between ${colorClass} border-b`}
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  <span className="font-semibold">{stage}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">
                  {stageProjects.length}
                </span>
              </button>

              {/* Projects */}
              {!isCollapsed && (
                <div className="p-2 space-y-2">
                  {stageProjects.length === 0 ? (
                    <div className="py-4 text-center text-gray-400 text-sm">
                      暂无项目
                    </div>
                  ) : (
                    stageProjects.map(project => (
                      <div
                        key={project.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, project.id)}
                        onClick={() => onProjectClick(project)}
                        className="bg-gray-50 p-3 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors cursor-pointer active:scale-[0.98] relative group"
                      >
                        <div className="flex gap-2">
                          <div className="w-1 rounded-full flex-shrink-0 self-stretch" style={{ backgroundColor: project.color }}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-bold text-gray-800 text-sm truncate flex-1">{project.name}</h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenId(menuOpenId === project.id ? null : project.id);
                                }}
                                className="p-1 -mr-1 -mt-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-opacity flex-shrink-0"
                              >
                                <MoreVertical size={14} className="text-gray-400" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs text-gray-500">{project.clientName}</p>
                              <span className="text-[10px] px-1.5 py-0.5 bg-white text-gray-600 rounded border border-gray-200">
                                {project.clientType}
                              </span>
                            </div>
                          </div>
                        </div>
                        {/* Dropdown Menu */}
                        {menuOpenId === project.id && (
                          <div className="absolute top-8 right-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[100px]">
                            <button
                              onClick={(e) => handleDeleteClick(e, project.id)}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 size={14} /> 删除
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-2">确认删除</h3>
            <p className="text-gray-600 mb-6">
              确定要删除这个项目吗？相关的任务和OKR也会被删除，此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {menuOpenId && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setMenuOpenId(null)}
        />
      )}
    </div>
  );
};

export default ProjectKanban;
