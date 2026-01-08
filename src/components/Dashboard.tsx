import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Plus, Calendar, Clock, AlertCircle, Pencil, X, Check, Eye, EyeOff, Search } from 'lucide-react';
import { format, isPast, isToday, isTomorrow, parseISO } from 'date-fns';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  uid: string;
  category: string;
  dueDate: string;
  createdAt: any; 
}

interface DashboardProps {
  user: User;
}

// ⚡ Custom Templates for Opticians
const QUICK_TEMPLATES = ["Referral:", "GOS18:", "Notes:", "Order:", "Phone:"];

export default function Dashboard({ user }: DashboardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('General');
  const [categories, setCategories] = useState<string[]>(['General']);
  const [isLoading, setIsLoading] = useState(true);

  // New Features State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [privacyMode, setPrivacyMode] = useState(false); // 👁️ Privacy
  const [searchQuery, setSearchQuery] = useState('');    // 🔍 Search

  useEffect(() => {
    const unsubCat = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists() && docSnap.data().categories) {
        setCategories(docSnap.data().categories);
      }
    });

    const q = query(collection(db, 'todos'), where('uid', '==', user.uid));
    const unsubTodos = onSnapshot(q, (snapshot) => {
      let tasks = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Todo));
      
      tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
      
      setTodos(tasks);
      setIsLoading(false);
    });

    return () => { unsubCat(); unsubTodos(); };
  }, [user]);

  // Filter tasks based on Search
  const filteredTodos = todos.filter(todo => 
    todo.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
    todo.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await addDoc(collection(db, 'todos'), {
      text: input,
      completed: false,
      uid: user.uid,
      category,
      dueDate,
      createdAt: serverTimestamp()
    });
    setInput('');
    setDueDate('');
  };

  const toggleComplete = async (todo: Todo) => {
    if (navigator.vibrate) navigator.vibrate(50);
    await updateDoc(doc(db, 'todos', todo.id), { completed: !todo.completed });
  };

  const deleteTodo = async (id: string) => {
    await deleteDoc(doc(db, 'todos', id));
  };

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    await updateDoc(doc(db, 'todos', id), { text: editText });
    setEditingId(null);
    setEditText('');
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return null;
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  const getDateColor = (dateStr: string, completed: boolean) => {
    if (!dateStr || completed) return 'text-slate-500';
    const date = parseISO(dateStr);
    if (isPast(date) && !isToday(date)) return 'text-rose-400 font-bold';
    if (isToday(date)) return 'text-amber-400 font-bold';
    return 'text-indigo-300';
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4">
      
      {/* Header with Privacy Toggle */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent">
            Clinical Admin
          </h1>
          <div className="flex items-center gap-2 text-slate-400 mt-2 text-sm font-medium">
            <Clock size={16} />
            <span>{format(new Date(), 'EEEE, do MMMM yyyy')}</span>
          </div>
        </div>

        {/* Top Controls: Search + Privacy */}
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition" size={16} />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find patient..."
              className="bg-slate-900/50 border border-slate-700 rounded-full py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-indigo-500 w-[180px] transition-all"
            />
          </div>
          
          <button 
            onClick={() => setPrivacyMode(!privacyMode)}
            className={`p-2 rounded-full border transition-all ${privacyMode ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
            title="Toggle Privacy Mode (Blur Text)"
          >
            {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </header>

      {/* Input Form */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8 relative z-10"
      >
        <form 
          onSubmit={addTodo} 
          className="glass-panel p-2 pl-4 flex flex-wrap sm:flex-nowrap gap-3 items-center focus-within:ring-1 ring-indigo-500/50 transition-all"
        >
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            className="flex-1 bg-transparent border-none focus:outline-none text-lg placeholder-slate-600 h-12 text-slate-200 min-w-[200px]"
            placeholder="New admin task..." 
            autoFocus
          />
          <div className="hidden sm:block h-8 w-[1px] bg-white/10"></div>
          <input 
            type="date" 
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="bg-transparent text-slate-400 text-sm outline-none cursor-pointer hover:text-white"
          />
          <select 
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
            className="bg-transparent text-slate-400 hover:text-white text-sm outline-none cursor-pointer max-w-[100px] truncate"
          >
            {categories.map(c => <option key={c} value={c} className="bg-slate-900 text-slate-300">{c}</option>)}
          </select>
          <button type="submit" className="bg-indigo-600 w-12 h-12 rounded-xl hover:bg-indigo-500 transition flex items-center justify-center text-white shadow-lg active:scale-90 ml-auto sm:ml-0">
            <Plus size={24} />
          </button>
        </form>

        {/* Quick Templates Chips */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2 scrollbar-hide">
          {QUICK_TEMPLATES.map(tmpl => (
            <button 
              key={tmpl}
              onClick={() => setInput(tmpl + ' ')}
              className="text-xs font-medium bg-slate-800/50 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:border-indigo-500/30 transition whitespace-nowrap"
            >
              + {tmpl}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Task List */}
      <div className="space-y-3 pb-20">
        {isLoading ? (
           <div className="text-center text-slate-500 mt-10">Syncing...</div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredTodos.map((todo) => (
              <motion.div 
                key={todo.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                className={`glass-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between group transition-all duration-300 border-l-4 ${todo.completed ? 'border-l-slate-700 opacity-50 bg-slate-900/30' : 'border-l-indigo-500'}`}
              >
                <div className="flex items-start sm:items-center gap-4 w-full">
                  {editingId !== todo.id && (
                    <button onClick={() => toggleComplete(todo)} className="text-slate-500 hover:text-indigo-400 transition mt-1 sm:mt-0">
                      {todo.completed ? <CheckCircle2 className="text-emerald-500/80" size={24} /> : <Circle size={24} />}
                    </button>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    {editingId === todo.id ? (
                      <div className="flex items-center gap-2 w-full">
                         <input 
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(todo.id)}
                            className="w-full bg-slate-800/50 text-white p-2 rounded border border-indigo-500/50 focus:outline-none"
                            autoFocus
                         />
                      </div>
                    ) : (
                      <>
                        {/* 👁️ PRIVACY BLUR LOGIC APPLIED HERE */}
                        <p 
                          className={`text-lg truncate transition-all ${todo.completed ? 'line-through decoration-slate-600 text-slate-500' : 'text-slate-200'} ${privacyMode ? 'blur-md hover:blur-none select-none duration-500' : ''}`}
                        >
                          {todo.text}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                            {todo.category}
                          </span>
                          {todo.dueDate && (
                            <div className={`flex items-center gap-1 text-xs ${getDateColor(todo.dueDate, todo.completed)}`}>
                              {isPast(parseISO(todo.dueDate)) && !isToday(parseISO(todo.dueDate)) && !todo.completed ? <AlertCircle size={12} /> : <Calendar size={12} />}
                              <span>{formatDateDisplay(todo.dueDate)}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 absolute top-4 right-4 sm:static sm:ml-4">
                  {editingId === todo.id ? (
                    <>
                      <button onClick={() => saveEdit(todo.id)} className="text-emerald-400 hover:bg-emerald-400/10 p-2 rounded-lg transition"><Check size={18} /></button>
                      <button onClick={() => setEditingId(null)} className="text-rose-400 hover:bg-rose-400/10 p-2 rounded-lg transition"><X size={18} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEditing(todo)} className="text-slate-500 hover:text-indigo-400 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 hover:bg-white/5 rounded-lg"><Pencil size={18} /></button>
                      <button onClick={() => deleteTodo(todo.id)} className="text-slate-500 hover:text-rose-400 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 hover:bg-white/5 rounded-lg"><Trash2 size={18} /></button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        {!isLoading && filteredTodos.length === 0 && (
          <div className="text-center py-20 opacity-30 select-none">
            {searchQuery ? <p>No matches found.</p> : <><div className="text-6xl mb-4 grayscale">✨</div><p className="text-xl font-light">All clear.</p></>}
          </div>
        )}
      </div>
    </div>
  );
}