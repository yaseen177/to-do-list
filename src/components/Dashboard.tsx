import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Plus } from 'lucide-react';

export default function Dashboard({ user }) {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [category, setCategory] = useState('General');
  const [userCategories, setUserCategories] = useState(['General', 'Urgent', 'Deep Work']);

  // Fetch Settings (Categories)
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "users", user.uid), (doc) => {
      if (doc.exists() && doc.data().categories) {
        setUserCategories(doc.data().categories);
      }
    });
    return () => unsubSettings();
  }, [user]);

  // Fetch Todos
  useEffect(() => {
    const q = query(collection(db, 'todos'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let tasks = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      // Simple sort: incomplete first
      tasks.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
      setTodos(tasks);
    });
    return () => unsubscribe();
  }, [user]);

  const addTodo = async (e) => {
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

  const toggleComplete = async (todo) => {
    await updateDoc(doc(db, 'todos', todo.id), { completed: !todo.completed });
  };

  const deleteTodo = async (id) => {
    await deleteDoc(doc(db, 'todos', id));
  };

  return (
    <div className="max-w-3xl mx-auto mt-10">
      {/* Input Section */}
      <motion.form 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onSubmit={addTodo} 
        className="glass-panel p-4 flex gap-3 items-center mb-8"
      >
        <input 
          type="text" 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          className="input-field flex-1 bg-transparent border-none focus:ring-0 text-lg placeholder-slate-500"
          placeholder="What needs focusing on today?" 
        />
        <select 
          value={category} 
          onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-800 text-slate-300 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700"
        >
          {userCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <button type="submit" className="bg-indigo-600 p-3 rounded-lg hover:bg-indigo-500 transition">
          <Plus size={20} />
        </button>
      </motion.form>

      {/* Todo List */}
      <div className="space-y-3">
        <AnimatePresence>
          {todos.map((todo) => (
            <motion.div 
              key={todo.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`glass-panel p-4 flex items-center justify-between group ${todo.completed ? 'opacity-50' : 'opacity-100'}`}
            >
              <div className="flex items-center gap-4">
                <button onClick={() => toggleComplete(todo)} className="text-slate-400 hover:text-indigo-400 transition">
                  {todo.completed ? <CheckCircle2 className="text-indigo-500" /> : <Circle />}
                </button>
                <div>
                  <p className={`text-lg ${todo.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>{todo.text}</p>
                  <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    {todo.category}
                  </span>
                </div>
              </div>
              <button onClick={() => deleteTodo(todo.id)} className="text-slate-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                <Trash2 size={18} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {todos.length === 0 && <p className="text-center text-slate-600 mt-10">All clear. Enjoy your day.</p>}
      </div>
    </div>
  );
}