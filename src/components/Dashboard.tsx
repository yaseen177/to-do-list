import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Plus, Calendar } from 'lucide-react';
import { format } from 'date-fns';

// Define what a Todo looks like
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  uid: string;
  category: string;
  createdAt: any; 
}

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');
  const [category, setCategory] = useState('General');
  const [categories, setCategories] = useState<string[]>(['General']);
  const [isLoading, setIsLoading] = useState(true);

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
        if (a.completed === b.completed) return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        return a.completed ? 1 : -1;
      });
      setTodos(tasks);
      setIsLoading(false);
    });

    return () => { unsubCat(); unsubTodos(); };
  }, [user]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await addDoc(collection(db, 'todos'), {
      text: input,
      completed: false,
      uid: user.uid,
      category,
      createdAt: serverTimestamp()
    });
    setInput('');
  };

  const toggleComplete = async (todo: Todo) => {
    if (navigator.vibrate) navigator.vibrate(50);
    await updateDoc(doc(db, 'todos', todo.id), { completed: !todo.completed });
  };

  const deleteTodo = async (id: string) => {
    await deleteDoc(doc(db, 'todos', id));
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4">
      <header className="mb-10">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent">
          Workspace
        </h1>
        <div className="flex items-center gap-2 text-slate-400 mt-2 text-sm font-medium">
          <Calendar size={16} />
          <span>{format(new Date(), 'EEEE, do MMMM yyyy')}</span>
        </div>
      </header>

      <motion.form 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onSubmit={addTodo} 
        className="glass-panel p-2 pl-4 flex gap-3 items-center mb-8 focus-within:ring-1 ring-indigo-500/50 transition-all"
      >
        <input 
          type="text" 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          className="flex-1 bg-transparent border-none focus:outline-none text-lg placeholder-slate-600 h-12 text-slate-200"
          placeholder="What needs doing?" 
          autoFocus
        />
        <div className="h-8 w-[1px] bg-white/10"></div>
        <select 
          value={category} 
          onChange={(e) => setCategory(e.target.value)}
          className="bg-transparent text-slate-400 hover:text-white text-sm outline-none cursor-pointer transition-colors max-w-[120px] truncate"
        >
          {categories.map(c => <option key={c} value={c} className="bg-slate-900 text-slate-300">{c}</option>)}
        </select>
        <button type="submit" className="bg-indigo-600 w-12 h-12 rounded-xl hover:bg-indigo-500 transition flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 active:scale-90">
          <Plus size={24} />
        </button>
      </motion.form>

      <div className="space-y-3 pb-20">
        {isLoading ? (
           <div className="text-center text-slate-500 mt-10">Syncing...</div>
        ) : (
          <AnimatePresence mode="popLayout">
            {todos.map((todo) => (
              <motion.div 
                key={todo.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                className={`glass-panel p-4 flex items-center justify-between group transition-all duration-300 border-l-4 ${todo.completed ? 'border-l-slate-700 opacity-50 bg-slate-900/30' : 'border-l-indigo-500'}`}
              >
                <div className="flex items-center gap-4 w-full">
                  <button onClick={() => toggleComplete(todo)} className="text-slate-500 hover:text-indigo-400 transition">
                    {todo.completed ? <CheckCircle2 className="text-emerald-500/80" size={24} /> : <Circle size={24} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-lg truncate transition-all ${todo.completed ? 'line-through decoration-slate-600 text-slate-500' : 'text-slate-200'}`}>
                      {todo.text}
                    </p>
                  </div>
                  <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-white/5 px-2 py-1 rounded">
                    {todo.category}
                  </span>
                </div>
                <button onClick={() => deleteTodo(todo.id)} className="ml-4 text-slate-600 hover:text-rose-400 transition opacity-0 group-hover:opacity-100 p-2 hover:bg-white/5 rounded-lg">
                  <Trash2 size={18} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {!isLoading && todos.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 opacity-30 select-none">
            <div className="text-6xl mb-4 grayscale">✨</div>
            <p className="text-xl font-light">Zero tasks. You're free.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}