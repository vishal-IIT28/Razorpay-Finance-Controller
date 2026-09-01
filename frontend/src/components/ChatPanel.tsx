'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Sparkles,
  Send,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Terminal,
  ShieldAlert,
  Bot,
  User,
  Copy,
  Check,
  Zap,
  CornerDownLeft,
  Search,
  AlertTriangle,
  Layers,
  ChevronRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface ToolCall {
  tool: string;
  args: any;
  result: any;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  isRefusal?: boolean;
  createdAt?: string;
}

interface ChatPanelProps {
  runId: string;
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const SUGGESTED_PROMPTS = [
  'What is the overall match rate and summary of this run?',
  'Why did payment pay_qupuVNka3rkAeZ fail to match?',
  'List the top bank statement discrepancies requiring action',
  'How many records were resolved in Pass 3 by Gemini AI?',
];

export default function ChatPanel({ runId, isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const storageKey = `finreconcile_chat_${runId}`;

  // Helper to detect if an assistant answer is a refusal
  const isRefusalContent = (content: string, toolCalls?: ToolCall[]) => {
    const text = content.toLowerCase();
    return (
      text.includes('cannot provide') ||
      text.includes('cannot answer') ||
      text.includes('weather') ||
      text.includes('outside the scope') ||
      text.includes('not within the scope') ||
      text.includes('out of scope') ||
      text.includes('capabilities are limited') ||
      text.includes('capabilities are strictly limited') ||
      text.includes('strictly limited') ||
      text.includes('only answer questions related to') ||
      text.includes('does not exist in the reconciliation') ||
      text.includes('does not exist in the database') ||
      text.includes('unable to find any data for run id') ||
      text.includes('as a finance operations and reconciliation assistant') ||
      text.includes('financial operations assistant, i can only') ||
      text.includes('do not have access to external') ||
      text.includes('not related to financial operations') ||
      text.includes('unverified target')
    );
  };

  // Load or initialize conversation on mount / runId change
  useEffect(() => {
    let activeConvId = '';
    try {
      activeConvId = sessionStorage.getItem(storageKey) || '';
    } catch {
      // sessionStorage might not be available in some SSR environments
    }

    if (activeConvId) {
      setConversationId(activeConvId);
      // Fetch persisted history for this specific conversation
      fetch(`${API_BASE}/api/runs/${runId}/chat?conversationId=${activeConvId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.messages)) {
            const mapped: ChatMessageItem[] = data.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              toolCalls: m.tool_calls || m.toolCalls || undefined,
              isRefusal: m.role === 'assistant' && isRefusalContent(m.content, m.tool_calls),
              createdAt: m.created_at,
            }));
            setMessages(mapped);
          }
        })
        .catch(() => {});
    } else {
      setConversationId(null);
      setMessages([]);
    }
  }, [runId, storageKey]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  const toggleToolExpand = (msgId: string, toolIdx: number) => {
    const key = `${msgId}_${toolIdx}`;
    setExpandedTools((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSendMessage = async (promptToSend?: string) => {
    const text = (promptToSend || inputText).trim();
    if (!text || loading) return;

    setInputText('');
    const tempUserMsgId = `user_${Date.now()}`;
    const newUserMsg: ChatMessageItem = {
      id: tempUserMsgId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/runs/${runId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: conversationId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const resData = await response.json();

      // Persist conversationId in state and sessionStorage
      if (resData.conversationId) {
        setConversationId(resData.conversationId);
        try {
          sessionStorage.setItem(storageKey, resData.conversationId);
        } catch {}
      }

      const isRefusal = isRefusalContent(resData.answer, resData.toolCalls);

      const assistantMsg: ChatMessageItem = {
        id: resData.messageId || `asst_${Date.now()}`,
        role: 'assistant',
        content: resData.answer,
        toolCalls: resData.toolCalls || [],
        isRefusal,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessageItem = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message || 'Unable to communicate with the Settlement Q&A Agent.'}`,
        isRefusal: true,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetConversation = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    setConversationId(null);
    setMessages([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] lg:w-[560px] bg-[#0b101e] border-l border-slate-800 shadow-2xl flex flex-col animate-slide-left">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Settlement Q&A Agent
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-950/80 border border-purple-800/80 text-purple-300">
                Gemini 3.5 Tools
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono-numbers">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Target: {runId.slice(0, 8)}...</span>
              {conversationId && (
                <span className="text-slate-400 text-[10px]">
                  • Session: {conversationId.slice(0, 6)}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleResetConversation}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="Reset conversation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
        {messages.length === 0 ? (
          <div className="py-8 px-2 space-y-5 animate-fade-in">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto">
                <Bot className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-semibold text-slate-200">
                Financial Operations & Audit Assistant
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                Ask questions about settlement match rates, investigate specific payment or transaction IDs, examine Pass 3 AI reasoning, or audit discrepancies.
              </p>
            </div>

            {/* Suggested Starter Prompts */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Suggested Inquiries
              </span>
              <div className="space-y-1.5">
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(prompt)}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <span>{prompt}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-400 transition-colors shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end gap-2.5 max-w-[90%] ml-auto">
                  <div className="p-3 rounded-2xl bg-purple-600 text-white shadow-md shadow-purple-600/20 rounded-tr-sm">
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-purple-700/60 border border-purple-500/40 flex items-center justify-center text-white shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                </div>
              );
            }

            // Refusal / Out-of-Scope Card
            if (msg.isRefusal) {
              return (
                <div key={msg.id} className="flex justify-start gap-2.5 max-w-[95%]">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-800/60 text-amber-200 shadow-md space-y-2 rounded-tl-sm w-full">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-amber-400 border-b border-amber-800/40 pb-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Agent Policy: Request Declined / Out of Scope
                    </div>
                    <p className="text-xs leading-relaxed text-amber-200/90 whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            }

            // Normal Assistant Bubble with Tool Traces
            return (
              <div key={msg.id} className="flex justify-start gap-2.5 max-w-[95%]">
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="space-y-2.5 w-full">
                  {/* Tool Call Traces (Visually prominent collapsible detail) */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-1.5">
                      {msg.toolCalls.map((tc, tIdx) => {
                        const isExpanded = expandedTools[`${msg.id}_${tIdx}`];
                        return (
                          <div
                            key={tIdx}
                            className="rounded-xl border border-sky-900/60 bg-sky-950/30 overflow-hidden text-[11px] font-mono-numbers"
                          >
                            <button
                              onClick={() => toggleToolExpand(msg.id, tIdx)}
                              className="w-full px-3 py-2 flex items-center justify-between text-sky-300 hover:bg-sky-900/30 transition-colors cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-2">
                                <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="font-semibold text-sky-200">
                                  Called Tool: <code className="text-emerald-300 font-bold">{tc.tool}</code>
                                </span>
                              </div>
                              <span className="text-sky-400 flex items-center gap-1 text-[10px]">
                                {isExpanded ? 'Hide Trace' : 'View Payload'}
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="p-3 border-t border-sky-900/40 bg-[#070b16] space-y-2 text-[10px]">
                                <div>
                                  <span className="text-slate-400 uppercase tracking-wider font-sans font-semibold text-[9px]">
                                    Invocation Arguments:
                                  </span>
                                  <pre className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 overflow-x-auto">
                                    {JSON.stringify(tc.args, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <span className="text-slate-400 uppercase tracking-wider font-sans font-semibold text-[9px]">
                                    Database Lookup Result:
                                  </span>
                                  <pre className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-800 text-emerald-300 max-h-48 overflow-y-auto overflow-x-auto">
                                    {JSON.stringify(tc.result, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Main Answer Bubble */}
                  <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-slate-800 text-slate-200 shadow-md rounded-tl-sm space-y-2">
                    <p className="leading-relaxed whitespace-pre-wrap text-xs font-sans">
                      {msg.content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex justify-start gap-2.5 max-w-[90%] animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-slate-800 text-slate-300 rounded-tl-sm flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span className="text-xs">Consulting database & verifying records...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <div className="p-3.5 border-t border-slate-800 bg-[#0f172a]/90 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask Q&A Agent about payment IDs, matches, or exceptions..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 pr-10 font-sans"
            />
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-medium text-xs transition-all shadow-md shadow-purple-600/20 cursor-pointer disabled:cursor-not-allowed shrink-0"
            title="Send Message"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
