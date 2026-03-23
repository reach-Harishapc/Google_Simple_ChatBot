import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  Send, 
  LogOut, 
  MessageSquare, 
  Plus, 
  User as UserIcon, 
  Bot, 
  Loader2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: any;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: any;
  updatedAt: any;
}

// --- Main Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user) {
        // Create/Update user profile
        const userRef = doc(db, 'users', user.uid);
        setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: serverTimestamp()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      } else {
        setChats([]);
        setCurrentChatId(null);
        setMessages([]);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch Chats
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const chatsQuery = query(
      collection(db, 'chats'),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(chatsQuery, (snapshot) => {
      const chatList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as ChatSession))
        .filter(chat => (chat as any).userId === user.uid);
      setChats(chatList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

    return unsubscribe;
  }, [user, isAuthReady]);

  // Fetch Messages
  useEffect(() => {
    if (!currentChatId || !isAuthReady) {
      setMessages([]);
      return;
    }

    const messagesQuery = query(
      collection(db, 'chats', currentChatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const msgList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `chats/${currentChatId}/messages`));

    return unsubscribe;
  }, [currentChatId, isAuthReady]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const createNewChat = async () => {
    if (!user) return;
    try {
      const chatRef = await addDoc(collection(db, 'chats'), {
        userId: user.uid,
        title: 'New Chat',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setCurrentChatId(chatRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chats');
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !user || isLoading) return;

    let chatId = currentChatId;
    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // 1. Create chat if not exists
      if (!chatId) {
        const chatRef = await addDoc(collection(db, 'chats'), {
          userId: user.uid,
          title: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        chatId = chatRef.id;
        setCurrentChatId(chatId);
      }

      // 2. Add user message to Firestore
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        role: 'user',
        content: userMessage,
        createdAt: serverTimestamp()
      });

      // 3. Update chat title if it's the first message
      if (messages.length === 0) {
        await setDoc(doc(db, 'chats', chatId), {
          title: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 4. Get AI response
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })), { role: 'user', parts: [{ text: userMessage }] }],
      });

      const aiText = response.text || "Sorry, I couldn't generate a response.";

      // 5. Add AI message to Firestore
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        role: 'model',
        content: aiText,
        createdAt: serverTimestamp()
      });

    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-50 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-white rounded-3xl shadow-sm border border-zinc-200 text-center"
        >
          <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Bot className="w-8 h-8 text-zinc-600" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Welcome to Gemini Chat</h1>
          <p className="text-zinc-500 mb-8">Sign in with your Google account to start chatting with AI and save your history.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors font-medium"
          >
            <img src="https://www.gstatic.com/firebase/anonymous-scan.png" className="w-5 h-5 invert" alt="Google" referrerPolicy="no-referrer" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white text-zinc-900 font-sans">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 bg-zinc-50 border-r border-zinc-200 flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-700 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Chats
              </h2>
              <button 
                onClick={createNewChat}
                className="p-2 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-600"
                title="New Chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {chats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => setCurrentChatId(chat.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group ${
                    currentChatId === chat.id 
                      ? 'bg-white shadow-sm border border-zinc-200 text-zinc-900' 
                      : 'text-zinc-500 hover:bg-zinc-200/50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-sm font-medium">{chat.title}</span>
                </button>
              ))}
              {chats.length === 0 && (
                <div className="p-8 text-center text-zinc-400 text-sm italic">
                  No chats yet. Start a new one!
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-200 bg-zinc-50/50">
              <div className="flex items-center gap-3 mb-4">
                <img 
                  src={user.photoURL || ''} 
                  className="w-8 h-8 rounded-full border border-zinc-200" 
                  alt={user.displayName || 'User'} 
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{user.displayName}</p>
                  <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 border-b border-zinc-200 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <h1 className="font-semibold text-zinc-900 truncate max-w-md">
              {currentChatId ? chats.find(c => c.id === currentChatId)?.title : 'Gemini Chat'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded-full border border-emerald-100">
              Gemini Flash
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && !currentChatId && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-zinc-50 rounded-3xl flex items-center justify-center mb-6 border border-zinc-100">
                  <Bot className="w-8 h-8 text-zinc-400" />
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 mb-2">How can I help you today?</h3>
                <p className="text-zinc-500 max-w-sm">Start a new conversation or select an existing chat from the sidebar.</p>
              </div>
            )}

            {messages.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border ${
                  msg.role === 'user' 
                    ? 'bg-zinc-900 border-zinc-900 text-white' 
                    : 'bg-white border-zinc-200 text-zinc-600'
                }`}>
                  {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm border ${
                  msg.role === 'user' 
                    ? 'bg-zinc-900 text-white border-zinc-900 rounded-tr-none' 
                    : 'bg-white text-zinc-800 border-zinc-200 rounded-tl-none'
                }`}>
                  <div className="prose prose-sm max-w-none prose-zinc dark:prose-invert">
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
                <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center text-zinc-600">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-zinc-50 px-4 py-3 rounded-2xl rounded-tl-none border border-zinc-200 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-zinc-200 bg-white">
          <form 
            onSubmit={sendMessage}
            className="max-w-3xl mx-auto relative"
          >
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              disabled={isLoading}
              className="w-full px-6 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all disabled:opacity-50 pr-16"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:hover:bg-zinc-900"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-[10px] text-center text-zinc-400 mt-3 uppercase tracking-widest font-medium">
            Powered by Gemini 3 Flash • Built with Firebase
          </p>
        </div>
      </main>
    </div>
  );
}
