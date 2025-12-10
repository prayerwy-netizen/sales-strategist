import React, { useState, useEffect } from 'react';
import { ArrowLeft, Send, Sparkles, Target, ListTodo, MessageSquare, Mic, StopCircle, Loader2, Plus, X, Edit2, Check, Trash2 } from 'lucide-react';
import { Project, Task, OKR, ChatMessage, ProjectInsightResult } from '../types';
import { GoogleGenAI } from "@google/genai";
import { generateOKR, generateProjectInsight } from '../services/geminiService';

// 生成唯一 ID 的工具函数
const generateId = (prefix: string = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

interface ProjectDetailProps {
  project: Project;
  tasks: Task[];
  okr?: OKR;
  onBack: () => void;
  onUpdateOKR: (okr: OKR) => void;
  onUpdateProject?: (project: Project) => void;
  onAddTask?: (task: { content: string; date: string; projectId: string; krId?: string }) => void;
  onEditTask?: (taskId: string, content: string, date: string, krId?: string) => void;
  onToggleTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteProject?: (projectId: string) => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, tasks, okr, onBack, onUpdateOKR, onUpdateProject, onAddTask, onEditTask, onToggleTask, onDeleteTask, onDeleteProject }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'okr' | 'tasks' | 'chat'>('overview');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', content: `我是你的销售军师。关于【${project.name}】这个项目，你可以：\n\n1. 告诉我项目进展，我帮你分析\n2. 问我客户可能在想什么\n3. 让我帮你梳理下一步行动\n4. 说"生成任务"我会帮你创建待办\n\n现在，说说情况吧。` }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [isGeneratingOKR, setIsGeneratingOKR] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // OKR editing states
  const [editingKRId, setEditingKRId] = useState<string | null>(null);
  const [editingProgress, setEditingProgress] = useState(0);
  const [editingKRContent, setEditingKRContent] = useState('');
  const [isEditingKRContent, setIsEditingKRContent] = useState(false);
  const [isAddingKR, setIsAddingKR] = useState(false);
  const [newKRContent, setNewKRContent] = useState('');
  const [isEditingObjective, setIsEditingObjective] = useState(false);
  const [editingObjective, setEditingObjective] = useState('');

  // AI OKR suggestions (non-destructive)
  const [aiSuggestedOKR, setAiSuggestedOKR] = useState<{objective: string; keyResults: string[]} | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<number[]>([]);
  const [useNewObjective, setUseNewObjective] = useState(false);

  // Task editing states
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskContent, setEditingTaskContent] = useState('');
  const [editingTaskDate, setEditingTaskDate] = useState('');
  const [editingTaskKrId, setEditingTaskKrId] = useState<string>('');
  const [isKrDropdownOpen, setIsKrDropdownOpen] = useState(false);

  // AI Insight states
  const [aiInsight, setAiInsight] = useState<ProjectInsightResult | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [selectedInsightTasks, setSelectedInsightTasks] = useState<number[]>([]);
  const [selectedInsightKRs, setSelectedInsightKRs] = useState<number[]>([]);
  const [insightTaskKRMapping, setInsightTaskKRMapping] = useState<Record<number, string>>({}); // 任务index -> krId

  // Project editing states
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editedProject, setEditedProject] = useState<Project>(project);

  // Pending tasks from chat
  const [pendingTasks, setPendingTasks] = useState<{content: string; date: string; krId?: string}[]>([]);

  // Pending KRs from chat
  const [pendingKRs, setPendingKRs] = useState<string[]>([]);
  const [selectedPendingKRs, setSelectedPendingKRs] = useState<number[]>([]);

  // Build project context for AI
  const buildProjectContext = () => {
    const pendingTasksList = tasks.filter(t => !t.isCompleted);
    const completedTasksList = tasks.filter(t => t.isCompleted);

    // 构建进展历史摘要
    const progressSummary = project.progressHistory && project.progressHistory.length > 0
      ? project.progressHistory
          .slice(-10) // 最近10条
          .map(p => `[${p.date}] ${p.content}${p.details ? ` (${p.details})` : ''}`)
          .join('\n')
      : '暂无历史记录';

    return `
【项目全貌】
- 项目名称：${project.name}
- 客户名称：${project.clientName}
- 客户类型：${project.clientType}
- 当前阶段：${project.stage}
- 项目描述：${project.description || '暂无描述'}
- 预算范围：${project.budget || '未知'}
- 关键决策人：${project.decisionMaker || '未知'}
- 竞品情况：${project.competitors || '未知'}
- 当前下一步：${project.nextStep || '待定'}

【OKR情况】
${okr ? `目标：${okr.objective}\n关键结果：\n${okr.keyResults.map((kr, i) => `  ${i+1}. ${kr.content} (进度${kr.progress}%)`).join('\n')}` : '暂无OKR'}

【任务情况】
- 待完成：${pendingTasksList.length}个
${pendingTasksList.slice(0, 5).map(t => `  - ${t.content} (${t.date})`).join('\n')}
- 已完成：${completedTasksList.length}个
${completedTasksList.slice(0, 5).map(t => `  ✓ ${t.content}`).join('\n')}

【项目进展历史（最近）】
${progressSummary}
    `.trim();
  };

  // Chat Logic - Enhanced with project context and task generation
  const handleSendMessage = async () => {
    if (!inputMsg.trim()) return;

    const userMessage = inputMsg.trim();
    const newMsg: ChatMessage = { id: generateId('msg'), role: 'user', content: userMessage };
    setMessages(prev => [...prev, newMsg]);
    setInputMsg('');
    setIsTyping(true);

    // Check if user wants to generate tasks
    const wantsTask = /生成任务|创建任务|添加任务|帮我列|列出.*任务|下一步|行动计划|to.?do/i.test(userMessage);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '';
      if (!apiKey) {
        throw new Error('Gemini API Key 未配置');
      }
      const ai = new GoogleGenAI({ apiKey });

      // Build KR list for AI to reference
      const krList = okr ? okr.keyResults.map((kr, i) => `KR${i+1}: ${kr.content} (ID:${kr.id})`).join('\n') : '暂无KR';

      const systemPrompt = `你是"销售军师"，一个经验丰富、说话直接犀利的ToB销售顾问。

你的风格：
- 说话直接，不绕弯子，不说废话
- 分析客户心理时一针见血
- 给建议时具体可执行，不说空话
- 如果用户的做法有问题，直接指出
- 偶尔毒舌是为了让用户清醒

当前项目背景：
${buildProjectContext()}

当前项目的关键结果(KR)：
${krList}

回复要求：
1. 回复要有深度和具体内容，不要太简短
2. 针对用户说的情况，给出分析和建议
3. 如果用户要求生成任务，在回复最后用【任务】标记列出，并指明关联的KR（如果有），格式如：
   【任务】
   - 明天：联系张总确认需求 [KR:kr-id-here]
   - 后天：准备方案PPT [KR:kr-id-here]
   - 本周五：发送报价单
   注意：[KR:xxx]是可选的，只有任务明显属于某个KR时才添加
4. 如果用户提供了新的项目信息，帮他总结关键点
5. 如果用户要求生成KR、补充KR、或者你觉得需要新增KR来推进项目，用【新KR】标记列出，格式如：
   【新KR】
   - 本月内完成3次客户拜访
   - 提交初版方案并获得反馈
   - 确认预算范围和决策流程`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          ...messages.map(m => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: systemPrompt
        }
      });

      const responseText = response.text || "我暂时无法分析，请稍后再试。";

      // Extract tasks if present
      const taskMatch = responseText.match(/【任务】([\s\S]*?)(?=\n\n|$)/);
      if (taskMatch) {
        const taskLines = taskMatch[1].split('\n').filter(line => line.trim().startsWith('-'));
        const today = new Date();
        const extractedTasks = taskLines.map(line => {
          // Extract KR ID if present
          const krMatch = line.match(/\[KR:([^\]]+)\]/);
          const krId = krMatch ? krMatch[1] : undefined;

          // Remove KR tag from content
          let cleanLine = line.replace(/\s*\[KR:[^\]]+\]/, '');
          const content = cleanLine.replace(/^-\s*/, '').replace(/^(明天|后天|今天|本周.+?)[:：]\s*/, '');
          const dateHint = cleanLine.match(/(明天|后天|今天|本周一|本周二|本周三|本周四|本周五)/)?.[1];

          let taskDate = new Date(today);
          if (dateHint === '明天') taskDate.setDate(today.getDate() + 1);
          else if (dateHint === '后天') taskDate.setDate(today.getDate() + 2);
          else if (dateHint?.startsWith('本周')) {
            const dayMap: Record<string, number> = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5};
            const targetDay = dayMap[dateHint.slice(-1)] || 1;
            const currentDay = today.getDay() || 7;
            taskDate.setDate(today.getDate() + (targetDay - currentDay + 7) % 7);
          } else {
            taskDate.setDate(today.getDate() + 1); // default to tomorrow
          }

          return {
            content: content.trim(),
            date: taskDate.toISOString().split('T')[0],
            krId
          };
        }).filter(t => t.content);

        if (extractedTasks.length > 0) {
          setPendingTasks(extractedTasks);
        }
      }

      // Extract KRs if present
      const krMatch = responseText.match(/【新KR】([\s\S]*?)(?=\n\n|$)/);
      if (krMatch) {
        const krLines = krMatch[1].split('\n').filter(line => line.trim().startsWith('-'));
        const extractedKRs = krLines.map(line => {
          return line.replace(/^-\s*/, '').trim();
        }).filter(kr => kr);

        if (extractedKRs.length > 0) {
          setPendingKRs(extractedKRs);
          setSelectedPendingKRs(extractedKRs.map((_, i) => i)); // 默认全选
        }
      }

      setMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'model',
        content: responseText
      }]);

    } catch (e) {
      console.error('Chat error:', e);
      setMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'model',
        content: "连接出问题了，请检查网络后重试。"
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Add pending tasks to task list
  const handleAddPendingTasks = () => {
    if (onAddTask && pendingTasks.length > 0) {
      pendingTasks.forEach(task => {
        onAddTask({
          content: task.content,
          date: task.date,
          projectId: project.id,
          krId: task.krId
        });
      });
      const linkedCount = pendingTasks.filter(t => t.krId).length;
      setPendingTasks([]);
      setMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'model',
        content: `已添加 ${pendingTasks.length} 个任务到任务列表${linkedCount > 0 ? `，其中 ${linkedCount} 个已关联到KR` : ''}。去"任务"Tab查看吧。`
      }]);
    }
  };

  // Add pending KRs to OKR
  const handleAddPendingKRs = () => {
    if (selectedPendingKRs.length === 0) return;

    const krsToAdd = selectedPendingKRs.map(idx => pendingKRs[idx]);

    if (okr) {
      // Add to existing OKR
      const newKRs = krsToAdd.map((content) => ({
        id: generateId('kr'),
        content,
        progress: 0
      }));
      onUpdateOKR({
        ...okr,
        keyResults: [...okr.keyResults, ...newKRs]
      });
    } else {
      // Create new OKR with these KRs
      onUpdateOKR({
        id: generateId('okr'),
        projectId: project.id,
        objective: `推进${project.name}项目`,
        keyResults: krsToAdd.map((content) => ({
          id: generateId('kr'),
          content,
          progress: 0
        }))
      });
    }

    setPendingKRs([]);
    setSelectedPendingKRs([]);
    setMessages(prev => [...prev, {
      id: generateId('msg'),
      role: 'model',
      content: `已添加 ${krsToAdd.length} 个KR到OKR中。去"OKR"Tab查看吧。`
    }]);
  };

  const handleGenerateOKR = async () => {
    setIsGeneratingOKR(true);
    setAiSuggestedOKR(null); // Clear previous suggestions
    try {
        // 传递完整的项目上下文
        const result = await generateOKR(project, okr, tasks);
        console.log('OKR generated:', result);

        if (!result || !result.objective || !Array.isArray(result.keyResults) || result.keyResults.length === 0) {
            throw new Error('Invalid response: missing objective or keyResults');
        }

        // If no OKR exists, create directly
        if (!okr) {
            onUpdateOKR({
                id: generateId('okr'),
                projectId: project.id,
                objective: result.objective,
                keyResults: result.keyResults.map((kr) => ({
                    id: generateId('kr'),
                    content: kr,
                    progress: 0
                }))
            });
        } else {
            // OKR exists, show as suggestions instead of replacing
            setAiSuggestedOKR(result);
            setSelectedSuggestions(result.keyResults.map((_, i) => i)); // Default select all
            setUseNewObjective(false);
        }
    } catch(e) {
        console.error('Generate OKR error:', e);
        alert("生成失败，请重试");
    } finally {
        setIsGeneratingOKR(false);
    }
  };

  // Apply selected AI suggestions to existing OKR
  const handleApplySuggestions = () => {
    if (!okr || !aiSuggestedOKR) return;

    let updatedOKR = { ...okr };

    // Update objective if selected
    if (useNewObjective) {
      updatedOKR.objective = aiSuggestedOKR.objective;
    }

    // Add selected KRs
    if (selectedSuggestions.length > 0) {
      const newKRs = selectedSuggestions.map(idx => ({
        id: generateId('kr'),
        content: aiSuggestedOKR.keyResults[idx],
        progress: 0
      }));
      updatedOKR.keyResults = [...updatedOKR.keyResults, ...newKRs];
    }

    onUpdateOKR(updatedOKR);
    setAiSuggestedOKR(null);
    setSelectedSuggestions([]);
    setUseNewObjective(false);
  };

  const handleDismissSuggestions = () => {
    setAiSuggestedOKR(null);
    setSelectedSuggestions([]);
    setUseNewObjective(false);
  };

  // OKR Progress Update
  const handleUpdateKRProgress = (krId: string, progress: number) => {
    if (!okr) return;
    const updatedKRs = okr.keyResults.map(kr =>
      kr.id === krId ? { ...kr, progress: Math.min(100, Math.max(0, progress)) } : kr
    );
    onUpdateOKR({ ...okr, keyResults: updatedKRs });
    setEditingKRId(null);
  };

  // Add new KR
  const handleAddKR = () => {
    if (!okr || !newKRContent.trim()) return;
    const newKR = {
      id: generateId('kr'),
      content: newKRContent.trim(),
      progress: 0
    };
    onUpdateOKR({ ...okr, keyResults: [...okr.keyResults, newKR] });
    setNewKRContent('');
    setIsAddingKR(false);
  };

  // Delete KR
  const handleDeleteKR = (krId: string) => {
    if (!okr) return;
    const updatedKRs = okr.keyResults.filter(kr => kr.id !== krId);
    onUpdateOKR({ ...okr, keyResults: updatedKRs });
  };

  // Update Objective
  const handleUpdateObjective = () => {
    if (!okr || !editingObjective.trim()) return;
    onUpdateOKR({ ...okr, objective: editingObjective.trim() });
    setIsEditingObjective(false);
  };

  // Update KR Content
  const handleUpdateKRContent = (krId: string) => {
    if (!okr || !editingKRContent.trim()) return;
    const updatedKRs = okr.keyResults.map(kr =>
      kr.id === krId ? { ...kr, content: editingKRContent.trim() } : kr
    );
    onUpdateOKR({ ...okr, keyResults: updatedKRs });
    setEditingKRId(null);
    setIsEditingKRContent(false);
    setEditingKRContent('');
  };

  // Save project info
  const handleSaveProject = () => {
    if (onUpdateProject) {
      onUpdateProject(editedProject);
    }
    setIsEditingProject(false);
  };

  // Handle task edit (need to add onEditTask prop)
  const handleSaveTaskEdit = () => {
    if (!editingTaskId || !editingTaskContent.trim()) return;
    // We need to call parent's edit function - will add this prop
    if (onEditTask) {
      onEditTask(editingTaskId, editingTaskContent.trim(), editingTaskDate, editingTaskKrId || undefined);
    }
    setEditingTaskId(null);
    setEditingTaskContent('');
    setEditingTaskDate('');
    setEditingTaskKrId('');
    setIsKrDropdownOpen(false);
  };

  // Load AI Insight
  const loadAiInsight = async () => {
    setIsLoadingInsight(true);
    setSelectedInsightTasks([]);
    setSelectedInsightKRs([]);
    setInsightTaskKRMapping({});
    try {
      const insight = await generateProjectInsight(project, tasks, okr);
      setAiInsight(insight);
      // 默认全选建议
      if (insight.suggestedTasks.length > 0) {
        setSelectedInsightTasks(insight.suggestedTasks.map((_, i) => i));
        // 如果有 KR，默认关联第一个 KR
        if (okr && okr.keyResults.length > 0) {
          const defaultMapping: Record<number, string> = {};
          insight.suggestedTasks.forEach((_, i) => {
            defaultMapping[i] = okr.keyResults[0].id;
          });
          setInsightTaskKRMapping(defaultMapping);
        }
      }
      if (insight.suggestedKRs.length > 0) {
        setSelectedInsightKRs(insight.suggestedKRs.map((_, i) => i));
      }
    } catch (e) {
      setAiInsight({
        analysis: '暂时无法分析，请稍后再试。',
        risks: [],
        suggestedTasks: [],
        suggestedKRs: []
      });
    } finally {
      setIsLoadingInsight(false);
    }
  };

  // Handle adding insight suggestions
  const handleAddInsightSuggestions = () => {
    if (!aiInsight) return;

    // First, create KRs and get their IDs
    let newKRIds: string[] = [];
    let updatedOkr = okr;

    if (selectedInsightKRs.length > 0) {
      const krsToAdd = selectedInsightKRs.map(idx => aiInsight.suggestedKRs[idx]).filter(Boolean);
      if (krsToAdd.length > 0) {
        const newKRs = krsToAdd.map(content => ({
          id: generateId('kr'),
          content,
          progress: 0
        }));
        newKRIds = newKRs.map(kr => kr.id);

        if (okr) {
          // Add to existing OKR
          updatedOkr = {
            ...okr,
            keyResults: [...okr.keyResults, ...newKRs]
          };
          onUpdateOKR(updatedOkr);
        } else {
          // Create new OKR
          updatedOkr = {
            id: generateId('okr'),
            projectId: project.id,
            objective: `推进${project.name}项目`,
            keyResults: newKRs
          };
          onUpdateOKR(updatedOkr);
        }
      }
    }

    // Then add tasks - auto-link to first new KR if no manual mapping
    if (selectedInsightTasks.length > 0 && onAddTask) {
      selectedInsightTasks.forEach(idx => {
        const task = aiInsight.suggestedTasks[idx];
        if (task) {
          // Priority: manual mapping > first new KR > existing first KR > none
          let krId = insightTaskKRMapping[idx];
          if (!krId && newKRIds.length > 0) {
            krId = newKRIds[0]; // Auto-link to first new KR
          } else if (!krId && updatedOkr && updatedOkr.keyResults.length > 0) {
            krId = updatedOkr.keyResults[0].id; // Link to first existing KR
          }

          onAddTask({
            content: task.content,
            date: task.date,
            projectId: project.id,
            krId: krId || undefined
          });
        }
      });
    }

    // Clear selections after adding
    setSelectedInsightTasks([]);
    setSelectedInsightKRs([]);
    setInsightTaskKRMapping({});
  };

  // Load insight when overview tab is active
  useEffect(() => {
    if (activeTab === 'overview' && !aiInsight) {
      loadAiInsight();
    }
  }, [activeTab]);

  return (
    <div className="fixed inset-0 bg-white z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 rounded-full">
          <ArrowLeft size={24} className="text-gray-700" />
        </button>
        <div className="w-1 h-8 rounded-full" style={{ backgroundColor: project.color }}></div>
        <div className="flex-1">
            <h1 className="font-bold text-lg text-gray-900 leading-tight">{project.name}</h1>
            <span className="text-xs text-gray-500">{project.clientName} · {project.stage}</span>
        </div>
        {onDeleteProject && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            删除
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {[
          { id: 'overview', icon: Sparkles, label: '概览' },
          { id: 'okr', icon: Target, label: 'OKR' },
          { id: 'tasks', icon: ListTodo, label: '任务' },
          { id: 'chat', icon: MessageSquare, label: '对话' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
              activeTab === tab.id ? 'text-primary border-b-2 border-primary' : 'text-gray-400'
            }`}
          >
            <tab.icon size={20} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        
        {activeTab === 'overview' && (
            <div className="p-4 space-y-4">
                {/* AI 洞察卡片 */}
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <Sparkles size={14} /> AI 洞察
                        </h3>
                        <button
                            onClick={loadAiInsight}
                            disabled={isLoadingInsight}
                            className="text-xs text-primary hover:underline"
                        >
                            刷新
                        </button>
                    </div>
                    {isLoadingInsight ? (
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                            <Loader2 className="animate-spin" size={16} /> 正在分析...
                        </div>
                    ) : aiInsight ? (
                        <div className="space-y-3">
                            {/* 核心分析 */}
                            <p className="text-gray-800 text-sm leading-relaxed">
                                {aiInsight.analysis}
                            </p>

                            {/* 风险点 */}
                            {aiInsight.risks.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-indigo-200">
                                    <p className="text-xs font-medium text-red-600 mb-2">⚠️ 风险点</p>
                                    <ul className="space-y-1">
                                        {aiInsight.risks.map((risk, i) => (
                                            <li key={i} className="text-xs text-gray-700 flex items-start gap-1">
                                                <span className="text-red-400">•</span>
                                                {risk}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* 建议的任务 */}
                            {aiInsight.suggestedTasks.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-indigo-200">
                                    <p className="text-xs font-medium text-green-600 mb-2">✅ 建议任务</p>
                                    <div className="space-y-3">
                                        {aiInsight.suggestedTasks.map((task, idx) => (
                                            <div key={idx} className="bg-gray-50 rounded-lg p-2">
                                                <label className="flex items-start gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedInsightTasks.includes(idx)}
                                                        onChange={() => {
                                                            setSelectedInsightTasks(prev =>
                                                                prev.includes(idx)
                                                                    ? prev.filter(i => i !== idx)
                                                                    : [...prev, idx]
                                                            );
                                                        }}
                                                        className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                    />
                                                    <div className="flex-1">
                                                        <span className="text-xs text-gray-700">{task.content}</span>
                                                        <span className="text-xs text-gray-400 ml-2">({task.date})</span>
                                                    </div>
                                                </label>
                                                {/* KR 关联选择 */}
                                                {selectedInsightTasks.includes(idx) && okr && okr.keyResults.length > 0 && (
                                                    <div className="mt-2 ml-6 flex items-center gap-2">
                                                        <span className="text-xs text-gray-500">关联KR:</span>
                                                        <select
                                                            value={insightTaskKRMapping[idx] || ''}
                                                            onChange={(e) => {
                                                                setInsightTaskKRMapping(prev => ({
                                                                    ...prev,
                                                                    [idx]: e.target.value
                                                                }));
                                                            }}
                                                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                                        >
                                                            <option value="">不关联</option>
                                                            {okr.keyResults.map((kr) => (
                                                                <option key={kr.id} value={kr.id}>
                                                                    {kr.content.length > 20 ? kr.content.slice(0, 20) + '...' : kr.content}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 建议的 KR */}
                            {aiInsight.suggestedKRs.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-indigo-200">
                                    <p className="text-xs font-medium text-purple-600 mb-2">🎯 建议KR</p>
                                    <div className="space-y-2">
                                        {aiInsight.suggestedKRs.map((kr, idx) => (
                                            <label key={idx} className="flex items-start gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedInsightKRs.includes(idx)}
                                                    onChange={() => {
                                                        setSelectedInsightKRs(prev =>
                                                            prev.includes(idx)
                                                                ? prev.filter(i => i !== idx)
                                                                : [...prev, idx]
                                                        );
                                                    }}
                                                    className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                />
                                                <span className="text-xs text-gray-700 flex-1">{kr}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 添加按钮 */}
                            {(selectedInsightTasks.length > 0 || selectedInsightKRs.length > 0) && (
                                <button
                                    onClick={handleAddInsightSuggestions}
                                    className="mt-3 w-full py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={16} />
                                    添加选中的建议
                                    {selectedInsightTasks.length > 0 && <span>({selectedInsightTasks.length}个任务)</span>}
                                    {selectedInsightKRs.length > 0 && <span>({selectedInsightKRs.length}个KR)</span>}
                                </button>
                            )}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">点击刷新获取AI分析</p>
                    )}
                </div>

                {/* 项目详情 - 可编辑 */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">项目信息</h3>
                        {!isEditingProject ? (
                            <button
                                onClick={() => {
                                    setEditedProject(project);
                                    setIsEditingProject(true);
                                }}
                                className="text-xs text-primary hover:underline"
                            >
                                编辑
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsEditingProject(false)}
                                    className="text-xs text-gray-500"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSaveProject}
                                    className="text-xs text-primary font-medium"
                                >
                                    保存
                                </button>
                            </div>
                        )}
                    </div>

                    {!isEditingProject ? (
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-gray-400 block text-xs">客户类型</span>
                                    <span className="text-gray-800">{project.clientType}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-xs">当前阶段</span>
                                    <span className="text-gray-800">{project.stage}</span>
                                </div>
                            </div>

                            {project.description && (
                                <div>
                                    <span className="text-gray-400 block text-xs mb-1">项目描述</span>
                                    <p className="text-gray-800 text-sm">{project.description}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-gray-400 block text-xs">预算范围</span>
                                    <span className="text-gray-800">{project.budget || '未填写'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-xs">关键决策人</span>
                                    <span className="text-gray-800">{project.decisionMaker || '未填写'}</span>
                                </div>
                            </div>

                            {project.competitors && (
                                <div>
                                    <span className="text-gray-400 block text-xs mb-1">竞品情况</span>
                                    <p className="text-gray-800 text-sm">{project.competitors}</p>
                                </div>
                            )}

                            {project.nextStep && (
                                <div>
                                    <span className="text-gray-400 block text-xs mb-1">当前下一步</span>
                                    <p className="text-gray-800 text-sm">{project.nextStep}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                                <div>
                                    <span className="text-gray-400 block text-xs">待办任务</span>
                                    <span className="text-gray-800">{tasks.filter(t => !t.isCompleted).length} 项</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-xs">更新时间</span>
                                    <span className="text-gray-800">{new Date(project.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">项目描述</label>
                                <textarea
                                    value={editedProject.description || ''}
                                    onChange={e => setEditedProject({...editedProject, description: e.target.value})}
                                    placeholder="描述项目背景、目标、关键信息..."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">预算范围</label>
                                    <input
                                        type="text"
                                        value={editedProject.budget || ''}
                                        onChange={e => setEditedProject({...editedProject, budget: e.target.value})}
                                        placeholder="如：50-100万"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">关键决策人</label>
                                    <input
                                        type="text"
                                        value={editedProject.decisionMaker || ''}
                                        onChange={e => setEditedProject({...editedProject, decisionMaker: e.target.value})}
                                        placeholder="如：张总（技术VP）"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">竞品情况</label>
                                <input
                                    type="text"
                                    value={editedProject.competitors || ''}
                                    onChange={e => setEditedProject({...editedProject, competitors: e.target.value})}
                                    placeholder="如：目前在比较XX和YY"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">当前下一步</label>
                                <input
                                    type="text"
                                    value={editedProject.nextStep || ''}
                                    onChange={e => setEditedProject({...editedProject, nextStep: e.target.value})}
                                    placeholder="如：等待客户内部汇报结果"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {activeTab === 'okr' && (
            <div className="p-4">
                {!okr ? (
                    <div className="text-center mt-20">
                        <Target className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                        <p className="text-gray-500 mb-6">暂无OKR规划</p>
                        <button
                            onClick={handleGenerateOKR}
                            disabled={isGeneratingOKR}
                            className="bg-primary text-white px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2 mx-auto"
                        >
                            {isGeneratingOKR ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                            让AI帮我梳理OKR
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs text-primary font-bold uppercase">Objective 目标</h3>
                                {!isEditingObjective ? (
                                    <button
                                        onClick={() => {
                                            setEditingObjective(okr.objective);
                                            setIsEditingObjective(true);
                                        }}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        编辑
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsEditingObjective(false)}
                                            className="text-xs text-gray-500"
                                        >
                                            取消
                                        </button>
                                        <button
                                            onClick={handleUpdateObjective}
                                            className="text-xs text-primary font-medium"
                                        >
                                            保存
                                        </button>
                                    </div>
                                )}
                            </div>
                            {!isEditingObjective ? (
                                <p className="text-xl font-bold text-gray-900">{okr.objective}</p>
                            ) : (
                                <textarea
                                    value={editingObjective}
                                    onChange={e => setEditingObjective(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-lg font-bold resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    rows={2}
                                    autoFocus
                                />
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between ml-1">
                                <h3 className="text-xs text-gray-500 font-bold uppercase">Key Results 关键结果</h3>
                                <button
                                    onClick={() => setIsAddingKR(true)}
                                    className="text-xs text-primary flex items-center gap-1"
                                >
                                    <Plus size={14} /> 添加KR
                                </button>
                            </div>

                            {okr.keyResults.map(kr => (
                                <div key={kr.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                    {/* KR Content - Editable */}
                                    {editingKRId === kr.id && isEditingKRContent ? (
                                        <div className="mb-3">
                                            <input
                                                type="text"
                                                value={editingKRContent}
                                                onChange={(e) => setEditingKRContent(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                autoFocus
                                            />
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingKRId(null);
                                                        setIsEditingKRContent(false);
                                                    }}
                                                    className="text-xs text-gray-500"
                                                >
                                                    取消
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateKRContent(kr.id)}
                                                    className="text-xs text-primary font-medium"
                                                >
                                                    保存
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-start mb-2">
                                            <span
                                                className="text-sm font-medium text-gray-800 flex-1 pr-2 cursor-pointer hover:text-primary"
                                                onClick={() => {
                                                    setEditingKRId(kr.id);
                                                    setEditingKRContent(kr.content);
                                                    setIsEditingKRContent(true);
                                                }}
                                            >
                                                {kr.content}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {editingKRId === kr.id && !isEditingKRContent ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={editingProgress}
                                                            onChange={(e) => setEditingProgress(Number(e.target.value))}
                                                            className="w-16 px-2 py-1 text-sm border border-gray-200 rounded"
                                                        />
                                                        <button
                                                            onClick={() => handleUpdateKRProgress(kr.id, editingProgress)}
                                                            className="text-xs text-primary font-medium"
                                                        >
                                                            保存
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setEditingKRId(kr.id);
                                                            setEditingProgress(kr.progress);
                                                            setIsEditingKRContent(false);
                                                        }}
                                                        className="text-sm font-bold text-primary hover:underline"
                                                    >
                                                        {kr.progress}%
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteKR(kr.id)}
                                                    className="text-gray-400 hover:text-red-500"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {/* Progress Bar */}
                                    {!(editingKRId === kr.id && isEditingKRContent) && (
                                        <div
                                            className="h-2 bg-gray-100 rounded-full overflow-hidden cursor-pointer"
                                            onClick={() => {
                                                setEditingKRId(kr.id);
                                                setEditingProgress(kr.progress);
                                                setIsEditingKRContent(false);
                                            }}
                                        >
                                            <div
                                                className={`h-full transition-all duration-500 ${
                                                    kr.progress >= 100 ? 'bg-green-500' :
                                                    kr.progress >= 70 ? 'bg-primary' :
                                                    kr.progress >= 30 ? 'bg-yellow-500' : 'bg-red-400'
                                                }`}
                                                style={{ width: `${kr.progress}%`}}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Add KR Form */}
                            {isAddingKR && (
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-primary">
                                    <input
                                        type="text"
                                        value={newKRContent}
                                        onChange={(e) => setNewKRContent(e.target.value)}
                                        placeholder="输入新的关键结果..."
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setIsAddingKR(false);
                                                setNewKRContent('');
                                            }}
                                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 text-sm"
                                        >
                                            取消
                                        </button>
                                        <button
                                            onClick={handleAddKR}
                                            className="flex-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm"
                                        >
                                            添加
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Regenerate OKR button */}
                            <button
                                onClick={handleGenerateOKR}
                                disabled={isGeneratingOKR}
                                className={`w-full mt-4 py-3 text-sm border rounded-lg flex items-center justify-center gap-2 transition-colors ${
                                    isGeneratingOKR
                                        ? 'bg-primary/10 text-primary border-primary/30'
                                        : 'text-primary border-primary/30 hover:bg-primary/5'
                                }`}
                            >
                                {isGeneratingOKR ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16} />
                                        AI正在分析项目，请稍候...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={16} />
                                        {okr ? '让AI给我新建议' : '让AI帮我梳理OKR'}
                                    </>
                                )}
                            </button>

                            {/* AI Suggestions Panel */}
                            {aiSuggestedOKR && !isGeneratingOKR && (
                                <div className="mt-4 bg-indigo-50 p-4 rounded-xl border border-indigo-200">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                                            <Sparkles size={16} /> AI建议（勾选后添加）
                                        </h4>
                                        <button
                                            onClick={handleDismissSuggestions}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Suggested Objective */}
                                    <div
                                        onClick={() => setUseNewObjective(!useNewObjective)}
                                        className={`p-3 rounded-lg mb-3 cursor-pointer transition-colors ${
                                            useNewObjective ? 'bg-white border-2 border-primary' : 'bg-white/50 border border-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                                useNewObjective ? 'bg-primary border-primary' : 'border-gray-300'
                                            }`}>
                                                {useNewObjective && <span className="text-white text-xs">✓</span>}
                                            </div>
                                            <span className="text-xs text-gray-500 uppercase">新目标</span>
                                        </div>
                                        <p className="mt-1 text-sm font-medium text-gray-800 ml-7">{aiSuggestedOKR.objective}</p>
                                    </div>

                                    {/* Suggested KRs */}
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-500 uppercase ml-1">新关键结果</p>
                                        {(aiSuggestedOKR.keyResults || []).map((kr, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    setSelectedSuggestions(prev =>
                                                        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                                    );
                                                }}
                                                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                                    selectedSuggestions.includes(idx)
                                                        ? 'bg-white border-2 border-primary'
                                                        : 'bg-white/50 border border-gray-200'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                                        selectedSuggestions.includes(idx) ? 'bg-primary border-primary' : 'border-gray-300'
                                                    }`}>
                                                        {selectedSuggestions.includes(idx) && <span className="text-white text-xs">✓</span>}
                                                    </div>
                                                    <span className="text-sm text-gray-800">{kr}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Apply Button */}
                                    <button
                                        onClick={handleApplySuggestions}
                                        disabled={!useNewObjective && selectedSuggestions.length === 0}
                                        className="w-full mt-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                    >
                                        添加选中项 {(useNewObjective ? 1 : 0) + selectedSuggestions.length > 0 && `(${(useNewObjective ? 1 : 0) + selectedSuggestions.length})`}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'tasks' && (
            <div className="p-4">
                {/* Task Edit Modal */}
                {editingTaskId && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl p-4 w-full max-w-sm shadow-2xl">
                            <h3 className="font-bold mb-3">编辑任务</h3>
                            <input
                                type="text"
                                value={editingTaskContent}
                                onChange={e => setEditingTaskContent(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="任务内容"
                            />
                            <input
                                type="date"
                                value={editingTaskDate}
                                onChange={e => setEditingTaskDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            {/* KR Selection - Custom Dropdown */}
                            {okr && okr.keyResults.length > 0 && (
                                <div className="mb-4">
                                    <label className="text-xs text-gray-500 mb-1 block">关联KR</label>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsKrDropdownOpen(!isKrDropdownOpen)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-left text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 flex items-center justify-between"
                                        >
                                            <span className="block truncate">
                                                {editingTaskKrId
                                                    ? okr.keyResults.find(kr => kr.id === editingTaskKrId)?.content || '不关联KR'
                                                    : '不关联KR'}
                                            </span>
                                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isKrDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {isKrDropdownOpen && (
                                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                                <div
                                                    onClick={() => {
                                                        setEditingTaskKrId('');
                                                        setIsKrDropdownOpen(false);
                                                    }}
                                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${!editingTaskKrId ? 'bg-primary/10 text-primary' : 'text-gray-700'}`}
                                                >
                                                    不关联KR
                                                </div>
                                                {okr.keyResults.map(kr => (
                                                    <div
                                                        key={kr.id}
                                                        onClick={() => {
                                                            setEditingTaskKrId(kr.id);
                                                            setIsKrDropdownOpen(false);
                                                        }}
                                                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-t border-gray-100 ${editingTaskKrId === kr.id ? 'bg-primary/10 text-primary' : 'text-gray-700'}`}
                                                    >
                                                        <div className="leading-relaxed">{kr.content}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setEditingTaskId(null);
                                        setEditingTaskContent('');
                                        setEditingTaskDate('');
                                        setEditingTaskKrId('');
                                        setIsKrDropdownOpen(false);
                                    }}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-gray-600"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSaveTaskEdit}
                                    className="flex-1 px-3 py-2 bg-primary text-white rounded-lg"
                                >
                                    保存
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 按KR分组显示任务 */}
                {okr && okr.keyResults.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-xs text-gray-500 font-bold uppercase mb-3">按关键结果分组</h3>
                        {okr.keyResults.map(kr => {
                            const krTasks = tasks.filter(t => t.krId === kr.id);
                            const completedCount = krTasks.filter(t => t.isCompleted).length;
                            return (
                                <div key={kr.id} className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-2 h-2 rounded-full ${kr.progress >= 100 ? 'bg-green-500' : 'bg-primary'}`}></div>
                                        <span className="text-sm font-medium text-gray-700 flex-1">{kr.content}</span>
                                        <span className="text-xs text-gray-400">{completedCount}/{krTasks.length}</span>
                                    </div>
                                    {krTasks.length > 0 ? (
                                        <div className="ml-4 space-y-2">
                                            {krTasks.map(task => (
                                                <div key={task.id} className="bg-white p-2.5 rounded-lg border border-gray-100 flex items-center gap-2 group">
                                                    <button
                                                        onClick={() => onToggleTask && onToggleTask(task.id)}
                                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                            task.isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-primary'
                                                        }`}
                                                    >
                                                        {task.isCompleted && <Check size={12} className="text-white" />}
                                                    </button>
                                                    <span className={`text-sm flex-1 ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.content}</span>
                                                    <span className="text-xs text-gray-400">{task.date}</span>
                                                    <button
                                                        onClick={() => {
                                                            setEditingTaskId(task.id);
                                                            setEditingTaskContent(task.content);
                                                            setEditingTaskDate(task.date);
                                                        }}
                                                        className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary transition-opacity"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => onDeleteTask && onDeleteTask(task.id)}
                                                        className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="ml-4 text-xs text-gray-400 italic">暂无关联任务</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 未关联KR的任务（包括krId无效的任务） */}
                {(() => {
                    const validKrIds = okr ? okr.keyResults.map(kr => kr.id) : [];
                    const unlinkedTasks = tasks.filter(t => !t.krId || !validKrIds.includes(t.krId));
                    if (unlinkedTasks.length === 0 && (!okr || okr.keyResults.length === 0)) {
                        return <div className="text-center mt-20 text-gray-400">暂无任务</div>;
                    }
                    if (unlinkedTasks.length === 0) return null;
                    return (
                        <div>
                            <h3 className="text-xs text-gray-500 font-bold uppercase mb-3">
                                {okr ? '未关联KR的任务' : '所有任务'}
                            </h3>
                            {unlinkedTasks.map(task => (
                                <div key={task.id} className="bg-white p-3 mb-2 rounded-lg shadow-sm border border-gray-100 flex items-center gap-3 group">
                                    <button
                                        onClick={() => onToggleTask && onToggleTask(task.id)}
                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                            task.isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-primary'
                                        }`}
                                    >
                                        {task.isCompleted && <Check size={12} className="text-white" />}
                                    </button>
                                    <div className="flex-1">
                                        <p className={`text-sm ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.content}</p>
                                        <p className="text-xs text-gray-400">{task.date}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setEditingTaskId(task.id);
                                            setEditingTaskContent(task.content);
                                            setEditingTaskDate(task.date);
                                        }}
                                        className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary transition-opacity"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={() => onDeleteTask && onDeleteTask(task.id)}
                                        className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </div>
        )}

        {activeTab === 'chat' && (
            <div className="flex flex-col h-full">
                <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'model' && (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0 text-xs font-bold text-indigo-600">
                                    AI
                                </div>
                            )}
                            <div className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-line ${
                                msg.role === 'user'
                                    ? 'bg-primary text-white rounded-br-none'
                                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                            }`}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isTyping && <div className="text-xs text-gray-400 ml-12">对方正在输入...</div>}

                    {/* Pending Tasks from AI */}
                    {pendingTasks.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 ml-10">
                            <div className="flex items-center gap-2 mb-3">
                                <ListTodo size={18} className="text-green-600" />
                                <span className="font-bold text-green-800 text-sm">AI提取的任务</span>
                            </div>
                            <div className="space-y-2 mb-4">
                                {pendingTasks.map((task, idx) => {
                                    const linkedKR = task.krId && okr ? okr.keyResults.find(kr => kr.id === task.krId) : null;
                                    return (
                                        <div key={idx} className="flex items-start gap-2 text-sm">
                                            <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5"></div>
                                            <div className="flex-1">
                                                <span className="text-gray-800">{task.content}</span>
                                                {linkedKR && (
                                                    <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                                        → {linkedKR.content.slice(0, 15)}...
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-500">{task.date}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                onClick={handleAddPendingTasks}
                                className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
                            >
                                <Plus size={16} />
                                添加到任务列表 ({pendingTasks.length}个)
                            </button>
                        </div>
                    )}

                    {/* Pending KRs from AI */}
                    {pendingKRs.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 ml-10">
                            <div className="flex items-center gap-2 mb-3">
                                <Target size={18} className="text-indigo-600" />
                                <span className="font-bold text-indigo-800 text-sm">AI建议的KR</span>
                            </div>
                            <div className="space-y-2 mb-4">
                                {pendingKRs.map((kr, idx) => (
                                    <label key={idx} className="flex items-start gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedPendingKRs.includes(idx)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedPendingKRs(prev => [...prev, idx]);
                                                } else {
                                                    setSelectedPendingKRs(prev => prev.filter(i => i !== idx));
                                                }
                                            }}
                                            className="mt-1 accent-indigo-600"
                                        />
                                        <span className="text-gray-800 flex-1">{kr}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setPendingKRs([]);
                                        setSelectedPendingKRs([]);
                                    }}
                                    className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                >
                                    忽略
                                </button>
                                <button
                                    onClick={handleAddPendingKRs}
                                    disabled={selectedPendingKRs.length === 0}
                                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                >
                                    <Plus size={16} />
                                    添加到OKR ({selectedPendingKRs.length}个)
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
                    <input
                        className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="说说项目情况..."
                        value={inputMsg}
                        onChange={e => setInputMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button onClick={handleSendMessage} disabled={!inputMsg.trim()} className="p-2 bg-primary text-white rounded-full disabled:opacity-50">
                        <Send size={18} />
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-2">确认删除项目</h3>
            <p className="text-gray-600 mb-6">
              确定要删除【{project.name}】吗？所有相关的任务、OKR 和进展记录都将被永久删除，此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (onDeleteProject) {
                    onDeleteProject(project.id);
                  }
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;