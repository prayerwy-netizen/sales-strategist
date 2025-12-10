import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Trash2, X, Pencil, MessageSquare, Send, Loader2, ArrowLeft, Plus } from 'lucide-react';
import { Task, Project, ChatMessage, OKR } from '../types';
import { chatTaskReport } from '../services/geminiService';

// 生成唯一 ID 的工具函数
const generateId = (prefix: string = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

interface CalendarViewProps {
  tasks: Task[];
  projects: Project[];
  okrs: OKR[];
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (taskId: string, content: string, date: string, krId?: string) => void;
  onAddTask?: (task: { content: string; date: string; projectId?: string; krId?: string }) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ tasks, projects, okrs, onToggleTask, onDeleteTask, onEditTask, onAddTask }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editKrId, setEditKrId] = useState<string>('');
  const [isEditKrDropdownOpen, setIsEditKrDropdownOpen] = useState(false);

  // New task state
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<string>('');
  const [newTaskKrId, setNewTaskKrId] = useState<string>('');
  const [isNewKrDropdownOpen, setIsNewKrDropdownOpen] = useState(false);

  // Task detail chat state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<{role: string; parts: {text: string}[]}[]>([]);
  const [pendingNewTask, setPendingNewTask] = useState<{content: string; date: string} | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);

  // Adjust so Monday is 0, Sunday is 6
  let firstDay = getFirstDayOfMonth(year, month) - 1;
  if (firstDay < 0) firstDay = 6;

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const formatDateKey = (day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getTasksForDate = (day: number) => {
    const dateKey = formatDateKey(day);
    return tasks.filter(t => t.date === dateKey);
  };

  const isTaskOverdue = (task: Task) => {
    if (task.isCompleted) return false;
    const today = new Date().toISOString().split('T')[0];
    return task.date < today;
  };

  const startEditTask = (task: Task) => {
    setEditingTask(task);
    setEditContent(task.content);
    setEditDate(task.date);
    setEditKrId(task.krId || '');
    setIsEditKrDropdownOpen(false);
  };

  const saveEditTask = () => {
    if (editingTask && editContent.trim()) {
      onEditTask(editingTask.id, editContent.trim(), editDate, editKrId || undefined);
      setEditingTask(null);
      setEditKrId('');
      setIsEditKrDropdownOpen(false);
    }
  };

  // Get KRs for the task's project (for edit modal)
  const getEditTaskKRs = () => {
    if (!editingTask?.projectId) return [];
    const okr = okrs.find(o => o.projectId === editingTask.projectId);
    return okr?.keyResults || [];
  };

  // Open task detail with AI chat
  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    const project = projects.find(p => p.id === task.projectId);
    const initialMsg: ChatMessage = {
      id: generateId('msg'),
      role: 'model',
      content: `关于任务【${task.content}】，说说完成情况？`
    };
    setChatMessages([initialMsg]);
    setConversationHistory([
      { role: 'model', parts: [{ text: initialMsg.content }] }
    ]);
    setPendingNewTask(null);
  };

  // Handle send message in task detail
  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isTyping || !selectedTask) return;

    const userMessage = inputMsg.trim();
    const newUserMsg: ChatMessage = {
      id: generateId('msg'),
      role: 'user',
      content: userMessage
    };

    setChatMessages(prev => [...prev, newUserMsg]);
    setInputMsg('');
    setIsTyping(true);

    try {
      const newHistory = [
        ...conversationHistory,
        { role: 'user', parts: [{ text: userMessage }] }
      ];

      const project = projects.find(p => p.id === selectedTask.projectId);
      const dayTasks = selectedDate ? getTasksForDate(selectedDate.getDate()) : [];

      const result = await chatTaskReport(
        newHistory,
        selectedTask,
        project!,
        dayTasks
      );

      setConversationHistory([
        ...newHistory,
        { role: 'model', parts: [{ text: result.response }] }
      ]);

      setChatMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'model',
        content: result.response
      }]);

      // Handle task completion
      if (result.taskCompleted && !selectedTask.isCompleted) {
        onToggleTask(selectedTask.id);
        setSelectedTask({ ...selectedTask, isCompleted: true });
      }

      // Handle new task suggestion
      if (result.newTaskSuggestion) {
        setPendingNewTask(result.newTaskSuggestion);
      }
    } catch (e) {
      console.error('Chat error:', e);
      setChatMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'model',
        content: '连接出了点问题，请重试。'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Add pending new task
  const handleAddNewTask = () => {
    if (pendingNewTask && onAddTask && selectedTask) {
      onAddTask({
        content: pendingNewTask.content,
        date: pendingNewTask.date,
        projectId: selectedTask.projectId
      });
      setPendingNewTask(null);
      setChatMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'model',
        content: '好的，任务已添加！'
      }]);
    }
  };

  // Create new task from calendar
  const handleCreateTask = () => {
    if (!newTaskContent.trim() || !selectedDate || !onAddTask) return;

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

    onAddTask({
      content: newTaskContent.trim(),
      date: dateStr,
      projectId: newTaskProjectId || undefined,
      krId: newTaskKrId || undefined
    });

    // Reset form
    setNewTaskContent('');
    setNewTaskProjectId('');
    setNewTaskKrId('');
    setIsAddingTask(false);
    setIsNewKrDropdownOpen(false);
  };

  // Get KRs for selected project
  const getProjectKRs = (projectId: string) => {
    const okr = okrs.find(o => o.projectId === projectId);
    return okr?.keyResults || [];
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const renderCalendarGrid = () => {
    const days = [];
    // Empty slots for previous month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 bg-gray-50/50 border border-gray-100"></div>);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = formatDateKey(day);
      const dayTasks = getTasksForDate(day);
      const isToday = dateKey === todayStr;

      days.push(
        <div
          key={day}
          onClick={() => setSelectedDate(new Date(year, month, day))}
          className={`h-24 border border-gray-100 p-1 relative flex flex-col items-start justify-start bg-white active:bg-gray-50 transition-colors cursor-pointer ${isToday ? 'ring-2 ring-primary inset-0 z-10' : ''}`}
        >
          <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-white' : 'text-gray-700'}`}>
            {day}
          </span>
          <div className="mt-1 w-full flex flex-col gap-1 overflow-hidden">
            {dayTasks.slice(0, 3).map(task => {
                const project = projects.find(p => p.id === task.projectId);
                const overdue = isTaskOverdue(task);
                return (
                    <div key={task.id} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${overdue ? 'bg-red-500' : ''}`} style={{ backgroundColor: overdue ? undefined : (project?.color || '#ccc') }} />
                        <span className={`text-[10px] truncate leading-tight ${task.isCompleted ? 'line-through text-gray-400' : overdue ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                            {task.content}
                        </span>
                    </div>
                )
            })}
            {dayTasks.length > 3 && (
                <span className="text-[10px] text-gray-400 pl-3">+{dayTasks.length - 3}</span>
            )}
          </div>
        </div>
      );
    }
    return days;
  };

  const selectedTasks = selectedDate ? getTasksForDate(selectedDate.getDate()) : [];

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-800">
          {year}年{month + 1}月
        </h2>
        <div className="flex gap-4">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronLeft size={20} />
          </button>
          <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Week Days */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {['一', '二', '三', '四', '五', '六', '日'].map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 overflow-y-auto pb-20 no-scrollbar">
        {renderCalendarGrid()}
      </div>

      {/* Task List Modal (Bottom Sheet) */}
      {selectedDate && !selectedTask && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col justify-end">
            <div className="bg-white rounded-t-2xl h-[60%] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
                <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800">
                        {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
                    </h3>
                    <button onClick={() => setSelectedDate(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {selectedTasks.length === 0 && !isAddingTask ? (
                        <div className="text-center text-gray-400 mt-10">今日无任务，添加一个吧</div>
                    ) : (
                        selectedTasks.map(task => {
                            const project = projects.find(p => p.id === task.projectId);
                            const overdue = isTaskOverdue(task);
                            return (
                                <div
                                  key={task.id}
                                  className={`p-3 bg-white border rounded-xl shadow-sm ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <button onClick={() => onToggleTask(task.id)} className="flex-shrink-0 mt-0.5">
                                            {task.isCompleted ? (
                                                <CheckCircle2 className="text-success" size={22} />
                                            ) : overdue ? (
                                                <Circle className="text-red-400" size={22} />
                                            ) : (
                                                <Circle className="text-gray-300" size={22} />
                                            )}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm ${task.isCompleted ? 'text-gray-400 line-through' : overdue ? 'text-red-600 font-medium' : 'text-gray-800'}`}>
                                                {task.content}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                {project && (
                                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                                        <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: project.color}} />
                                                        {project.name}
                                                    </span>
                                                )}
                                                {overdue && <span className="text-xs text-red-500">已过期</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Action buttons */}
                                    <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
                                        <button
                                          onClick={() => openTaskDetail(task)}
                                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-primary bg-primary/10 rounded-full hover:bg-primary/20"
                                        >
                                            <MessageSquare size={14} />
                                            汇报进展
                                        </button>
                                        <button onClick={() => startEditTask(task)} className="p-1.5 text-gray-400 hover:text-primary">
                                            <Pencil size={14} />
                                        </button>
                                        <button onClick={() => onDeleteTask(task.id)} className="p-1.5 text-gray-400 hover:text-danger">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            )
                        })
                    )}

                    {/* Add Task Form */}
                    {isAddingTask && (
                        <div className="p-4 bg-primary/5 border-2 border-primary/20 rounded-xl">
                            <input
                                type="text"
                                value={newTaskContent}
                                onChange={(e) => setNewTaskContent(e.target.value)}
                                placeholder="任务内容..."
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                autoFocus
                            />

                            {/* Project Selection */}
                            <div className="mb-3">
                                <label className="text-xs text-gray-500 mb-1 block">关联项目（可选）</label>
                                <select
                                    value={newTaskProjectId}
                                    onChange={(e) => {
                                        setNewTaskProjectId(e.target.value);
                                        setNewTaskKrId(''); // Reset KR when project changes
                                    }}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="">不关联项目</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* KR Selection - Custom Dropdown */}
                            {newTaskProjectId && getProjectKRs(newTaskProjectId).length > 0 && (
                                <div className="mb-3">
                                    <label className="text-xs text-gray-500 mb-1 block">关联KR（可选）</label>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsNewKrDropdownOpen(!isNewKrDropdownOpen)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-left text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 flex items-center justify-between"
                                        >
                                            <span className="block truncate">
                                                {newTaskKrId
                                                    ? getProjectKRs(newTaskProjectId).find(kr => kr.id === newTaskKrId)?.content || '不关联KR'
                                                    : '不关联KR'}
                                            </span>
                                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isNewKrDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {isNewKrDropdownOpen && (
                                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                                <div
                                                    onClick={() => {
                                                        setNewTaskKrId('');
                                                        setIsNewKrDropdownOpen(false);
                                                    }}
                                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${!newTaskKrId ? 'bg-primary/10 text-primary' : 'text-gray-700'}`}
                                                >
                                                    不关联KR
                                                </div>
                                                {getProjectKRs(newTaskProjectId).map(kr => (
                                                    <div
                                                        key={kr.id}
                                                        onClick={() => {
                                                            setNewTaskKrId(kr.id);
                                                            setIsNewKrDropdownOpen(false);
                                                        }}
                                                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-t border-gray-100 ${newTaskKrId === kr.id ? 'bg-primary/10 text-primary' : 'text-gray-700'}`}
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
                                        setIsAddingTask(false);
                                        setNewTaskContent('');
                                        setNewTaskProjectId('');
                                        setNewTaskKrId('');
                                        setIsNewKrDropdownOpen(false);
                                    }}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleCreateTask}
                                    disabled={!newTaskContent.trim()}
                                    className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
                                >
                                    添加
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Add Task Button */}
                {!isAddingTask && (
                    <div className="p-4 border-t border-gray-100">
                        <button
                            onClick={() => setIsAddingTask(true)}
                            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus size={18} />
                            添加任务
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Task Detail with AI Chat Modal */}
      {selectedTask && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white">
                <button
                  onClick={() => {
                    setSelectedTask(null);
                    setChatMessages([]);
                    setConversationHistory([]);
                    setPendingNewTask(null);
                  }}
                  className="p-2 -ml-2 hover:bg-gray-50 rounded-full"
                >
                    <ArrowLeft size={24} className="text-gray-700" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${selectedTask.isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {selectedTask.content}
                    </p>
                    <p className="text-xs text-gray-500">{selectedTask.date}</p>
                </div>
                <button
                  onClick={() => onToggleTask(selectedTask.id)}
                  className={`px-3 py-1 text-xs rounded-full ${selectedTask.isCompleted ? 'bg-gray-100 text-gray-500' : 'bg-success/10 text-success'}`}
                >
                    {selectedTask.isCompleted ? '已完成' : '标记完成'}
                </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {chatMessages.map(msg => (
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
                {isTyping && (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                            AI
                        </div>
                        <Loader2 className="animate-spin" size={16} />
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Pending new task card */}
            {pendingNewTask && (
                <div className="mx-4 mb-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-xs text-green-700 font-medium mb-2">建议添加任务</p>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-800">{pendingNewTask.content}</p>
                            <p className="text-xs text-gray-500">{pendingNewTask.date}</p>
                        </div>
                        <button
                          onClick={handleAddNewTask}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-xs rounded-full"
                        >
                            <Plus size={14} />
                            添加
                        </button>
                    </div>
                </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-100 bg-white">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={inputMsg}
                        onChange={(e) => setInputMsg(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="说说这个任务的进展..."
                        className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!inputMsg.trim() || isTyping}
                        className="p-2.5 bg-primary text-white rounded-full disabled:opacity-50"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="absolute inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">编辑任务</h3>
              <button onClick={() => { setEditingTask(null); setIsEditKrDropdownOpen(false); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1 block">任务内容</label>
                <input
                  type="text"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1 block">日期</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              {/* KR Selection - Custom Dropdown */}
              {editingTask.projectId && getEditTaskKRs().length > 0 && (
                <div>
                  <label className="text-sm text-gray-500 font-medium mb-1 block">关联KR</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsEditKrDropdownOpen(!isEditKrDropdownOpen)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-left text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 flex items-center justify-between"
                    >
                      <span className="block truncate">
                        {editKrId
                          ? getEditTaskKRs().find(kr => kr.id === editKrId)?.content || '不关联KR'
                          : '不关联KR'}
                      </span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isEditKrDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isEditKrDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        <div
                          onClick={() => {
                            setEditKrId('');
                            setIsEditKrDropdownOpen(false);
                          }}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${!editKrId ? 'bg-primary/10 text-primary' : 'text-gray-700'}`}
                        >
                          不关联KR
                        </div>
                        {getEditTaskKRs().map(kr => (
                          <div
                            key={kr.id}
                            onClick={() => {
                              setEditKrId(kr.id);
                              setIsEditKrDropdownOpen(false);
                            }}
                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-t border-gray-100 ${editKrId === kr.id ? 'bg-primary/10 text-primary' : 'text-gray-700'}`}
                          >
                            <div className="leading-relaxed">{kr.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setEditingTask(null); setIsEditKrDropdownOpen(false); }}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 font-medium"
                >
                  取消
                </button>
                <button
                  onClick={saveEditTask}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-medium"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
