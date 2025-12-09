import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Send, StopCircle, Loader2, Target, ListTodo, FileText, Plus, Check } from 'lucide-react';
import { Project, ReportAnalysisResult, OKR, Task } from '../types';
import { transcribeAudio, chatDailyReport } from '../services/geminiService';

// 生成唯一 ID 的工具函数
const generateId = (prefix: string = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

interface DailyReportModalProps {
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSaveTasks: (tasks: { content: string; date: string; projectId: string; krId?: string }[]) => void;
  onSaveOKR?: (okr: OKR) => void;
  onUpdateProject?: (project: Project) => void;
  okrs: OKR[];
  tasks: Task[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const DailyReportModal: React.FC<DailyReportModalProps> = ({
  projects,
  isOpen,
  onClose,
  onSaveTasks,
  onSaveOKR,
  onUpdateProject,
  okrs,
  tasks
}) => {
  // Project selection
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectOKR = okrs.find(o => o.projectId === selectedProjectId);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<{role: string; parts: {text: string}[]}[]>([]);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Extracted data state
  const [extractedData, setExtractedData] = useState<ReportAnalysisResult | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Selection states for saving
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [selectedKRs, setSelectedKRs] = useState<number[]>([]);
  const [selectedProjectUpdates, setSelectedProjectUpdates] = useState<string[]>([]);
  const [taskKRMapping, setTaskKRMapping] = useState<{[taskIdx: number]: string}>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedProjectId('');
      setMessages([]);
      setConversationHistory([]);
      setExtractedData(null);
      setShowSummary(false);
      setSelectedTasks([]);
      setSelectedKRs([]);
      setSelectedProjectUpdates([]);
      setTaskKRMapping({});
    }
  }, [isOpen]);

  // Initialize chat when project is selected
  useEffect(() => {
    if (selectedProjectId && messages.length === 0) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        setMessages([{
          id: '1',
          role: 'assistant',
          content: `好，${project.name}项目。今天做了什么？有什么进展或问题？`
        }]);
      }
    }
  }, [selectedProjectId, projects, messages.length]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Get existing KR contents for the selected project
  const getExistingKRs = (): string[] => {
    if (!projectOKR) return [];
    return projectOKR.keyResults.map(kr => kr.content);
  };

  // Get all available KRs (existing + suggested new ones)
  const getAllAvailableKRs = (): {id: string; content: string; isNew: boolean}[] => {
    const existing = projectOKR?.keyResults.map(kr => ({
      id: kr.id,
      content: kr.content,
      isNew: false
    })) || [];

    const suggested = (extractedData?.suggestedOKR?.keyResults || [])
      .filter((_, idx) => selectedKRs.includes(idx))
      .map((kr, idx) => ({
        id: `new-${idx}`,
        content: kr,
        isNew: true
      }));

    return [...existing, ...suggested];
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading || !selectedProject) return;

    const userMessage = inputText.trim();
    const newUserMsg: ChatMessage = {
      id: generateId('msg'),
      role: 'user',
      content: userMessage
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const newHistory = [
        ...conversationHistory,
        { role: 'user', parts: [{ text: userMessage }] }
      ];

      // 获取项目任务
      const projectTasks = tasks.filter(t => t.projectId === selectedProject.id);
      const completedTasks = projectTasks.filter(t => t.isCompleted).map(t => t.content);
      const pendingTasks = projectTasks.filter(t => !t.isCompleted).map(t => t.content);

      const result = await chatDailyReport(
        newHistory,
        selectedProject,
        getExistingKRs(),
        completedTasks,
        pendingTasks
      );

      setConversationHistory([
        ...newHistory,
        { role: 'model', parts: [{ text: result.response }] }
      ]);

      setMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'assistant',
        content: result.response
      }]);

      if (result.isComplete && result.extractedData) {
        setExtractedData(result.extractedData);
        // Select all by default
        setSelectedTasks(result.extractedData.suggestedTasks?.map((_, i) => i) || []);
        setSelectedKRs(result.extractedData.suggestedOKR?.keyResults?.map((_, i) => i) || []);
        const updates = result.extractedData.projectUpdates;
        if (updates) {
          const fields: string[] = [];
          if (updates.description) fields.push('description');
          if (updates.budget) fields.push('budget');
          if (updates.decisionMaker) fields.push('decisionMaker');
          if (updates.competitors) fields.push('competitors');
          if (updates.nextStep) fields.push('nextStep');
          setSelectedProjectUpdates(fields);
        }
        setShowSummary(true);
      }
    } catch (e) {
      console.error('Chat error:', e);
      setMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'assistant',
        content: '连接出了点问题，请重试。'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("无法访问麦克风");
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = async () => {
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        try {
          const text = await transcribeAudio(audioBlob);
          setInputText(prev => prev + (prev ? ' ' : '') + text);
        } catch (error) {
          alert("语音转文字失败");
        } finally {
          setIsTranscribing(false);
          mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        }
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleConfirmSave = () => {
    if (!extractedData || !selectedProject) return;

    // 1. Save project updates
    if (onUpdateProject && selectedProjectUpdates.length > 0 && extractedData.projectUpdates) {
      const updates = extractedData.projectUpdates;
      const updatedProject: Project = {
        ...selectedProject,
        ...(selectedProjectUpdates.includes('description') && updates.description && { description: updates.description }),
        ...(selectedProjectUpdates.includes('budget') && updates.budget && { budget: updates.budget }),
        ...(selectedProjectUpdates.includes('decisionMaker') && updates.decisionMaker && { decisionMaker: updates.decisionMaker }),
        ...(selectedProjectUpdates.includes('competitors') && updates.competitors && { competitors: updates.competitors }),
        ...(selectedProjectUpdates.includes('nextStep') && updates.nextStep && { nextStep: updates.nextStep }),
        updatedAt: new Date().toISOString()
      };
      onUpdateProject(updatedProject);
    }

    // 2. Save new KRs first (so we can get their IDs for task mapping)
    let newKRIds: {[content: string]: string} = {};
    if (onSaveOKR && selectedKRs.length > 0 && extractedData.suggestedOKR) {
      const newKRs = selectedKRs.map((idx) => {
        const content = extractedData.suggestedOKR!.keyResults[idx];
        const id = generateId('kr');
        newKRIds[content] = id;
        return {
          id,
          content,
          progress: 0
        };
      });

      if (projectOKR) {
        // Add to existing OKR
        onSaveOKR({
          ...projectOKR,
          keyResults: [...projectOKR.keyResults, ...newKRs]
        });
      } else {
        // Create new OKR
        onSaveOKR({
          id: generateId('okr'),
          projectId: selectedProject.id,
          objective: extractedData.suggestedOKR.objective || `推进${selectedProject.name}项目`,
          keyResults: newKRs
        });
      }
    }

    // 3. Save tasks with KR mapping
    if (selectedTasks.length > 0) {
      const tasksToCreate = selectedTasks.map(idx => {
        const task = extractedData.suggestedTasks[idx];
        let krId = taskKRMapping[idx];

        // If no manual mapping, try to find matching KR
        if (!krId && task.suggestedKRContent) {
          // Check existing KRs
          const existingKR = projectOKR?.keyResults.find(kr =>
            kr.content.includes(task.suggestedKRContent!) ||
            task.suggestedKRContent!.includes(kr.content)
          );
          if (existingKR) {
            krId = existingKR.id;
          } else {
            // Check newly created KRs
            krId = newKRIds[task.suggestedKRContent] || undefined;
          }
        }

        return {
          content: task.content,
          date: task.date,
          projectId: selectedProject.id,
          krId
        };
      });

      onSaveTasks(tasksToCreate);
    }

    onClose();
  };

  const toggleTaskKR = (taskIdx: number, krId: string) => {
    setTaskKRMapping(prev => ({
      ...prev,
      [taskIdx]: prev[taskIdx] === krId ? '' : krId
    }));
  };

  if (!isOpen) return null;

  // Project selection screen
  if (!selectedProjectId) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-200">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">今日工作汇报</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 p-4">
          <p className="text-gray-600 mb-4">选择要汇报的项目：</p>
          <div className="space-y-3">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className="w-full p-4 bg-white border border-gray-200 rounded-xl text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                  <div>
                    <h3 className="font-bold text-gray-800">{p.name}</h3>
                    <p className="text-sm text-gray-500">{p.clientName} · {p.stage}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedProject?.color }} />
          <h2 className="text-lg font-bold">{selectedProject?.name} - 今日汇报</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
          <X size={24} />
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0 text-xs font-bold text-indigo-600">
                AI
              </div>
            )}
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-line ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-br-none'
                : 'bg-gray-100 text-gray-800 rounded-bl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm ml-10">
            <Loader2 className="animate-spin" size={16} />
            思考中...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Summary Card (when complete) */}
      {showSummary && extractedData && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 max-h-[60vh] overflow-y-auto">
          {/* AI Analysis */}
          <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 mb-4">
            <div className="flex items-center gap-2 mb-2 text-primary font-bold text-sm">
              <span>⚡</span> 军师点评
            </div>
            <p className="text-gray-800 text-sm whitespace-pre-line">{extractedData.analysis}</p>
          </div>

          {/* Project Updates */}
          {extractedData.projectUpdates && Object.keys(extractedData.projectUpdates).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={18} className="text-blue-600" />
                <span className="font-bold text-blue-800 text-sm">项目信息更新</span>
              </div>
              <div className="space-y-2">
                {extractedData.projectUpdates.description && (
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectUpdates.includes('description')}
                      onChange={(e) => {
                        setSelectedProjectUpdates(prev =>
                          e.target.checked ? [...prev, 'description'] : prev.filter(f => f !== 'description')
                        );
                      }}
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <span className="text-gray-500">项目背景：</span>
                      <span className="text-gray-800">{extractedData.projectUpdates!.description}</span>
                    </div>
                  </label>
                )}
                {extractedData.projectUpdates.budget && (
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectUpdates.includes('budget')}
                      onChange={(e) => {
                        setSelectedProjectUpdates(prev =>
                          e.target.checked ? [...prev, 'budget'] : prev.filter(f => f !== 'budget')
                        );
                      }}
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <span className="text-gray-500">预算范围：</span>
                      <span className="text-gray-800">{extractedData.projectUpdates!.budget}</span>
                    </div>
                  </label>
                )}
                {extractedData.projectUpdates.decisionMaker && (
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectUpdates.includes('decisionMaker')}
                      onChange={(e) => {
                        setSelectedProjectUpdates(prev =>
                          e.target.checked ? [...prev, 'decisionMaker'] : prev.filter(f => f !== 'decisionMaker')
                        );
                      }}
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <span className="text-gray-500">关键决策人：</span>
                      <span className="text-gray-800">{extractedData.projectUpdates!.decisionMaker}</span>
                    </div>
                  </label>
                )}
                {extractedData.projectUpdates.competitors && (
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectUpdates.includes('competitors')}
                      onChange={(e) => {
                        setSelectedProjectUpdates(prev =>
                          e.target.checked ? [...prev, 'competitors'] : prev.filter(f => f !== 'competitors')
                        );
                      }}
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <span className="text-gray-500">竞品情况：</span>
                      <span className="text-gray-800">{extractedData.projectUpdates!.competitors}</span>
                    </div>
                  </label>
                )}
                {extractedData.projectUpdates.nextStep && (
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectUpdates.includes('nextStep')}
                      onChange={(e) => {
                        setSelectedProjectUpdates(prev =>
                          e.target.checked ? [...prev, 'nextStep'] : prev.filter(f => f !== 'nextStep')
                        );
                      }}
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <span className="text-gray-500">下一步计划：</span>
                      <span className="text-gray-800">{extractedData.projectUpdates!.nextStep}</span>
                    </div>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Suggested KRs */}
          {extractedData.suggestedOKR && extractedData.suggestedOKR.keyResults && extractedData.suggestedOKR.keyResults.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Target size={18} className="text-indigo-600" />
                <span className="font-bold text-indigo-800 text-sm">建议KR</span>
              </div>
              <div className="space-y-2">
                {extractedData.suggestedOKR.keyResults.map((kr, idx) => (
                  <label key={idx} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedKRs.includes(idx)}
                      onChange={(e) => {
                        setSelectedKRs(prev =>
                          e.target.checked ? [...prev, idx] : prev.filter(i => i !== idx)
                        );
                      }}
                      className="mt-1 accent-indigo-600"
                    />
                    <span className="text-gray-800">{kr}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Tasks */}
          {extractedData.suggestedTasks && extractedData.suggestedTasks.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <ListTodo size={18} className="text-green-600" />
                <span className="font-bold text-green-800 text-sm">建议任务</span>
              </div>
              <div className="space-y-3">
                {extractedData.suggestedTasks.map((task, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 border border-green-100">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(idx)}
                        onChange={(e) => {
                          setSelectedTasks(prev =>
                            e.target.checked ? [...prev, idx] : prev.filter(i => i !== idx)
                          );
                        }}
                        className="mt-1 accent-green-600"
                      />
                      <div className="flex-1">
                        <span className="text-gray-800">{task.content}</span>
                        <span className="ml-2 text-xs text-gray-500">{task.date}</span>
                      </div>
                    </label>
                    {/* KR Selection for task */}
                    {selectedTasks.includes(idx) && (
                      <div className="mt-2 ml-6">
                        <p className="text-xs text-gray-500 mb-1">关联KR：</p>
                        <div className="flex flex-wrap gap-1">
                          {getAllAvailableKRs().map(kr => (
                            <button
                              key={kr.id}
                              onClick={() => toggleTaskKR(idx, kr.id)}
                              className={`px-2 py-1 rounded text-xs transition-colors ${
                                taskKRMapping[idx] === kr.id
                                  ? 'bg-primary text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {kr.isNew && <span className="text-yellow-300 mr-1">★</span>}
                              {kr.content.length > 15 ? kr.content.slice(0, 15) + '...' : kr.content}
                            </button>
                          ))}
                          {getAllAvailableKRs().length === 0 && (
                            <span className="text-xs text-gray-400">暂无可关联的KR</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={handleConfirmSave}
            className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg"
          >
            <Check size={18} />
            确认保存
            {(selectedProjectUpdates.length > 0 || selectedKRs.length > 0 || selectedTasks.length > 0) && (
              <span className="text-sm opacity-80">
                ({selectedProjectUpdates.length > 0 ? '项目信息' : ''}
                {selectedProjectUpdates.length > 0 && selectedKRs.length > 0 ? '+' : ''}
                {selectedKRs.length > 0 ? `${selectedKRs.length}个KR` : ''}
                {(selectedProjectUpdates.length > 0 || selectedKRs.length > 0) && selectedTasks.length > 0 ? '+' : ''}
                {selectedTasks.length > 0 ? `${selectedTasks.length}个任务` : ''})
              </span>
            )}
          </button>

          {/* Continue button */}
          <button
            onClick={() => setShowSummary(false)}
            className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700"
          >
            继续补充信息...
          </button>
        </div>
      )}

      {/* Input Area (hide when showing summary) */}
      {!showSummary && (
        <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing}
            className={`p-2.5 rounded-full transition-all ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isRecording ? <StopCircle size={18} /> : <Mic size={18} />}
          </button>

          <input
            ref={inputRef}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={isTranscribing ? "转写中..." : "说说今天的工作..."}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            disabled={isLoading || isTranscribing}
          />

          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 bg-primary text-white rounded-full disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DailyReportModal;
