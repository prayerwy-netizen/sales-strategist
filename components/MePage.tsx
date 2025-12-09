import React, { useState } from 'react';
import { User, Settings, PieChart, HelpCircle, Target, Download, ChevronRight, X, ArrowLeft, FileJson, FileSpreadsheet, Database, Loader2 } from 'lucide-react';
import { Project, OKR, Task } from '../types';
import { downloadDataAsJson, downloadDataAsCsv } from '../services/dataService';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface MePageProps {
  projects: Project[];
  okrs?: OKR[];
  tasks?: Task[];
}

const MePage: React.FC<MePageProps> = ({ projects, okrs = [], tasks = [] }) => {
  const [showOKROverview, setShowOKROverview] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const completedProjects = projects.filter(p => p.stage === '签约' || p.stage === '实施').length;
  const ongoingProjects = projects.length - completedProjects;
  const completedTasks = tasks.filter(t => t.isCompleted).length;
  const pendingTasks = tasks.filter(t => !t.isCompleted).length;

  // Calculate average OKR progress
  const avgOKRProgress = okrs.length > 0
    ? Math.round(okrs.reduce((sum, okr) => {
        const okrAvg = okr.keyResults.length > 0
          ? okr.keyResults.reduce((s, kr) => s + kr.progress, 0) / okr.keyResults.length
          : 0;
        return sum + okrAvg;
      }, 0) / okrs.length)
    : 0;

  // Export functions
  const exportToCSV = (type: 'projects' | 'tasks') => {
    let csvContent = '';
    let filename = '';

    if (type === 'projects') {
      csvContent = '项目名称,客户名称,客户类型,当前阶段,更新时间\n';
      csvContent += projects.map(p =>
        `"${p.name}","${p.clientName}","${p.clientType}","${p.stage}","${new Date(p.updatedAt).toLocaleDateString()}"`
      ).join('\n');
      filename = `项目清单_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      csvContent = '任务内容,所属项目,日期,状态\n';
      csvContent += tasks.map(t => {
        const project = projects.find(p => p.id === t.projectId);
        return `"${t.content}","${project?.name || '未知'}","${t.date}","${t.isCompleted ? '已完成' : '未完成'}"`;
      }).join('\n');
      filename = `任务清单_${new Date().toISOString().split('T')[0]}.csv`;
    }

    // Add BOM for Chinese characters in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportOptions(false);
  };

  // OKR Overview Modal
  if (showOKROverview) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white">
          <button onClick={() => setShowOKROverview(false)} className="p-2 -ml-2 hover:bg-gray-50 rounded-full">
            <ArrowLeft size={24} className="text-gray-700" />
          </button>
          <h1 className="font-bold text-lg text-gray-900">OKR 总览</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {okrs.length === 0 ? (
            <div className="text-center mt-20 text-gray-400">
              <Target className="w-16 h-16 mx-auto mb-4 text-gray-200" />
              <p>暂无OKR数据</p>
              <p className="text-sm mt-2">在项目详情中创建OKR</p>
            </div>
          ) : (
            <div className="space-y-4">
              {okrs.map(okr => {
                const project = projects.find(p => p.id === okr.projectId);
                const avgProgress = okr.keyResults.length > 0
                  ? Math.round(okr.keyResults.reduce((s, kr) => s + kr.progress, 0) / okr.keyResults.length)
                  : 0;

                return (
                  <div key={okr.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project?.color || '#ccc' }} />
                      <span className="text-xs text-gray-500 font-medium">{project?.name}</span>
                      <span className="ml-auto text-sm font-bold text-primary">{avgProgress}%</span>
                    </div>
                    <h3 className="font-bold text-gray-800 mb-3">{okr.objective}</h3>
                    <div className="space-y-2">
                      {okr.keyResults.map(kr => (
                        <div key={kr.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600 truncate flex-1 pr-2">{kr.content}</span>
                            <span className={`font-medium ${kr.progress >= 70 ? 'text-green-600' : kr.progress >= 30 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {kr.progress}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${kr.progress >= 70 ? 'bg-green-500' : kr.progress >= 30 ? 'bg-yellow-500' : 'bg-red-400'}`}
                              style={{ width: `${kr.progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-primary text-white p-8 pb-12 rounded-b-[2.5rem] shadow-lg">
        <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl border-2 border-white/30 backdrop-blur-sm">
                🦁
            </div>
            <div>
                <h1 className="text-2xl font-bold">销售精英</h1>
                <p className="text-white/80 text-sm">Sale Strategist Pro</p>
            </div>
        </div>

        <div className="flex justify-between mt-8">
            <div className="text-center">
                <span className="block text-3xl font-bold">{projects.length}</span>
                <span className="text-xs text-indigo-200">总项目</span>
            </div>
            <div className="text-center">
                <span className="block text-3xl font-bold">{ongoingProjects}</span>
                <span className="text-xs text-indigo-200">进行中</span>
            </div>
            <div className="text-center">
                <span className="block text-3xl font-bold">{completedProjects}</span>
                <span className="text-xs text-indigo-200">已签约</span>
            </div>
        </div>
      </div>

      <div className="flex-1 p-4 -mt-6 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <span className="text-xs text-gray-500">待办任务</span>
            <div className="flex items-end gap-1 mt-1">
              <span className="text-2xl font-bold text-gray-800">{pendingTasks}</span>
              <span className="text-xs text-gray-400 mb-1">项</span>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <span className="text-xs text-gray-500">OKR平均进度</span>
            <div className="flex items-end gap-1 mt-1">
              <span className="text-2xl font-bold text-primary">{avgOKRProgress}</span>
              <span className="text-xs text-gray-400 mb-1">%</span>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowOKROverview(true)}
              className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50"
            >
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Target size={18} />
                </div>
                <span className="flex-1 text-left font-medium text-gray-700">OKR 总览</span>
                <ChevronRight size={18} className="text-gray-400" />
            </button>
            <button
              onClick={() => setShowExportOptions(true)}
              className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50"
            >
                <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                  <Download size={18} />
                </div>
                <span className="flex-1 text-left font-medium text-gray-700">数据导出</span>
                <ChevronRight size={18} className="text-gray-400" />
            </button>
            <button className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50">
                <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Settings size={18} />
                </div>
                <span className="flex-1 text-left font-medium text-gray-700">设置 (AI风格：犀利)</span>
                <ChevronRight size={18} className="text-gray-400" />
            </button>
            <button className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
                  <HelpCircle size={18} />
                </div>
                <span className="flex-1 text-left font-medium text-gray-700">帮助与反馈</span>
                <ChevronRight size={18} className="text-gray-400" />
            </button>
        </div>
      </div>

      {/* Export Options Modal */}
      {showExportOptions && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">导出数据</h3>
              <button onClick={() => setShowExportOptions(false)} className="p-2 text-gray-500">
                <X size={20} />
              </button>
            </div>

            {/* 数据库状态提示 */}
            <div className={`mx-4 mt-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
              isSupabaseConfigured()
                ? 'bg-green-50 text-green-700'
                : 'bg-yellow-50 text-yellow-700'
            }`}>
              <Database size={16} />
              {isSupabaseConfigured()
                ? '已连接云端数据库，数据自动同步'
                : '未连接数据库，数据仅存在本地内存'}
            </div>

            <div className="p-4 space-y-3">
              {/* 完整备份 - JSON */}
              <button
                onClick={async () => {
                  setIsExporting(true);
                  try {
                    await downloadDataAsJson();
                  } finally {
                    setIsExporting(false);
                    setShowExportOptions(false);
                  }
                }}
                disabled={isExporting}
                className="w-full p-4 bg-indigo-50 rounded-xl text-left hover:bg-indigo-100 transition-colors flex items-start gap-3"
              >
                <FileJson size={24} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-medium text-gray-800 flex items-center gap-2">
                    完整数据备份
                    {isExporting && <Loader2 size={14} className="animate-spin" />}
                  </span>
                  <span className="text-xs text-gray-500 block mt-1">
                    导出所有项目、任务、OKR（JSON格式，可用于恢复）
                  </span>
                </div>
              </button>

              {/* CSV 导出 */}
              <button
                onClick={async () => {
                  setIsExporting(true);
                  try {
                    await downloadDataAsCsv();
                  } finally {
                    setIsExporting(false);
                    setShowExportOptions(false);
                  }
                }}
                disabled={isExporting}
                className="w-full p-4 bg-green-50 rounded-xl text-left hover:bg-green-100 transition-colors flex items-start gap-3"
              >
                <FileSpreadsheet size={24} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-medium text-gray-800">导出为表格</span>
                  <span className="text-xs text-gray-500 block mt-1">
                    导出项目、任务、OKR（CSV格式，可用Excel打开）
                  </span>
                </div>
              </button>

              {/* 单项导出 */}
              <div className="border-t border-gray-100 pt-3 mt-3">
                <p className="text-xs text-gray-400 mb-2 px-1">单项导出</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => exportToCSV('projects')}
                    className="p-3 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">项目清单</span>
                    <span className="text-xs text-gray-400 block">CSV</span>
                  </button>
                  <button
                    onClick={() => exportToCSV('tasks')}
                    className="p-3 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">任务清单</span>
                    <span className="text-xs text-gray-400 block">CSV</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 pt-0">
              <button
                onClick={() => setShowExportOptions(false)}
                className="w-full py-3 text-gray-500 font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MePage;