import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  MessageSquare, 
  Plus, 
  User as UserIcon, 
  Bot, 
  Loader2,
  Trash2,
  Sparkles,
  Settings,
  Key,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

// --- Main Component ---
export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return sessionStorage.getItem('gemini_api_key') || '';
  });
  const [tempApiKey, setTempApiKey] = useState(userApiKey);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use user key if provided, otherwise fallback to env key
  const activeApiKey = userApiKey || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey: activeApiKey });

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setUserApiKey(tempApiKey);
    if (tempApiKey) {
      sessionStorage.setItem('gemini_api_key', tempApiKey);
    } else {
      sessionStorage.removeItem('gemini_api_key');
    }
    setIsSettingsOpen(false);
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear the conversation?')) {
      setMessages([]);
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!activeApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const userMessage = input.trim();
    const newUserMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
      });

      const aiText = response.text || "Sorry, I couldn't generate a response.";
      const newAiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: aiText
      };

      setMessages(prev => [...prev, newAiMessage]);
    } catch (error: any) {
      console.error('Error sending message:', error);
      let errorText = "⚠️ **Error:** Failed to connect to Gemini.";
      
      if (error?.message?.includes('API_KEY_INVALID')) {
        errorText = "⚠️ **Invalid API Key:** The provided API key is incorrect. Please check your settings.";
      } else if (!activeApiKey) {
        errorText = "⚠️ **Missing API Key:** Please provide a Google AI API key in the settings to start chatting.";
      }

      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: errorText
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white text-zinc-900 font-sans">
      {/* Header */}
      <header className="h-16 border-b border-zinc-200 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="font-semibold text-zinc-900">Gemini Direct Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
              userApiKey 
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                : 'hover:bg-zinc-100 text-zinc-500'
            }`}
            title="API Settings"
          >
            <Settings className="w-5 h-5" />
            {userApiKey && <span className="hidden sm:inline">Custom Key Active</span>}
          </button>
          <button 
            onClick={clearChat}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
            title="Clear Chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <div className="hidden sm:block px-3 py-1 bg-zinc-100 text-zinc-600 text-xs font-semibold rounded-full border border-zinc-200">
            Gemini Flash
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {!activeApiKey && messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 bg-amber-50 border border-amber-200 rounded-3xl text-center max-w-lg mx-auto"
            >
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600">
                <Key className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-amber-900 mb-2">API Key Required</h3>
              <p className="text-amber-700 text-sm mb-6">
                To start chatting, please provide your own Google AI API key. It will only be stored in your browser's session storage.
              </p>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors shadow-sm"
              >
                Set API Key
              </button>
            </motion.div>
          )}

          {messages.length === 0 && activeApiKey && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 bg-zinc-50 rounded-[2.5rem] flex items-center justify-center mb-6 border border-zinc-100 shadow-sm"
              >
                <Bot className="w-10 h-10 text-zinc-400" />
              </motion.div>
              <h3 className="text-2xl font-semibold text-zinc-900 mb-2">Hello! I'm Gemini.</h3>
              <p className="text-zinc-500 max-w-sm">Ask me anything. I'm here to help you with code, writing, or just to chat.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10 w-full max-w-lg">
                {[
                  "Explain quantum computing",
                  "Write a poem about rain",
                  "How do I use React hooks?",
                  "Plan a 3-day trip to Tokyo"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="p-4 text-left text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-2xl hover:bg-zinc-100 hover:border-zinc-300 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center border ${
                msg.role === 'user' 
                  ? 'bg-zinc-900 border-zinc-900 text-white shadow-md' 
                  : 'bg-white border-zinc-200 text-zinc-600 shadow-sm'
              }`}>
                {msg.role === 'user' ? <UserIcon className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div className={`max-w-[85%] px-5 py-4 rounded-2xl shadow-sm border ${
                msg.role === 'user' 
                  ? 'bg-zinc-900 text-white border-zinc-900 rounded-tr-none' 
                  : 'bg-white text-zinc-800 border-zinc-200 rounded-tl-none'
              }`}>
                <div className="prose prose-sm max-w-none prose-zinc dark:prose-invert leading-relaxed">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ))}
          
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4"
            >
              <div className="w-9 h-9 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-600 shadow-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div className="bg-zinc-50 px-5 py-4 rounded-2xl rounded-tl-none border border-zinc-200 flex items-center gap-2">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-6 border-t border-zinc-200 bg-white/80 backdrop-blur-md">
        <form 
          onSubmit={sendMessage}
          className="max-w-3xl mx-auto relative group"
        >
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeApiKey ? "Ask Gemini anything..." : "Set API key to start chatting..."}
            disabled={isLoading}
            className="w-full px-6 py-5 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all disabled:opacity-50 pr-16 shadow-sm group-hover:border-zinc-300"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900 shadow-md active:scale-95"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
        <p className="text-[10px] text-center text-zinc-400 mt-4 uppercase tracking-[0.2em] font-bold">
          Stateless Session • Gemini 3 Flash
        </p>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-100 rounded-xl text-zinc-600">
                    <Key className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-900">API Settings</h2>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={saveApiKey} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Google AI API Key
                  </label>
                  <div className="relative">
                    <input 
                      type="password"
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      placeholder="Enter your API key..."
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all pr-10"
                    />
                    {userApiKey && tempApiKey === userApiKey && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                    Your key is stored in <span className="font-semibold">session storage</span>. It will be cleared when you close the tab. No data is sent to our servers.
                  </p>
                </div>

                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-zinc-600 space-y-1">
                      <p className="font-semibold text-zinc-900">Where to get a key?</p>
                      <p>You can get a free Gemini API key from the <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline font-medium">Google AI Studio</a>.</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setTempApiKey('');
                      setUserApiKey('');
                      sessionStorage.removeItem('gemini_api_key');
                    }}
                    className="flex-1 px-4 py-3 bg-zinc-100 text-zinc-600 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
                  >
                    Clear Key
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors shadow-md active:scale-95"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
