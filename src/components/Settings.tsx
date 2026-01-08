import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { motion } from 'framer-motion';
import { Save, Layers, Plus, X } from 'lucide-react';

interface SettingsProps {
  user: User;
}

export default function Settings({ user }: SettingsProps) {
  const [categories, setCategories] = useState<string[]>(['General', 'Urgent', 'Deep Work']);
  const [newCat, setNewCat] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists() && docSnap.data().categories) {
        setCategories(docSnap.data().categories);
      }
    };
    fetchData();
  }, [user]);

  const saveSettings = async () => {
    try {
      setStatus('Saving...');
      await setDoc(doc(db, 'users', user.uid), {
        categories
      }, { merge: true });
      setStatus('Saved successfully');
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      console.error(e);
      setStatus('Error saving');
    }
  };

  const addCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCat && !categories.includes(newCat)) {
      setCategories([...categories, newCat]);
      setNewCat('');
    }
  };

  const removeCategory = (cat: string) => {
    setCategories(categories.filter(c => c !== cat));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="max-w-xl mx-auto mt-10"
    >
      <h2 className="text-3xl font-bold mb-8">Settings</h2>
      
      <div className="glass-panel p-8">
        <div className="flex items-center gap-3 mb-6 text-indigo-300">
          <Layers size={24} />
          <h3 className="text-xl font-semibold">Workflow Categories</h3>
        </div>
        
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((cat) => (
            <motion.span 
              layout
              key={cat} 
              className="bg-slate-800 border border-slate-700 pl-4 pr-2 py-2 rounded-xl text-sm flex items-center gap-2 group"
            >
              {cat}
              <button 
                onClick={() => removeCategory(cat)} 
                className="text-slate-500 hover:text-rose-400 p-1 rounded-md hover:bg-white/10 transition"
              >
                <X size={14} />
              </button>
            </motion.span>
          ))}
        </div>

        <form onSubmit={addCategory} className="flex gap-2 mb-8">
          <input 
            value={newCat} 
            onChange={(e) => setNewCat(e.target.value)} 
            className="glass-input" 
            placeholder="Create a new category..." 
          />
          <button type="submit" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white p-3 rounded-xl transition">
            <Plus size={20} />
          </button>
        </form>

        <div className="h-[1px] bg-white/10 my-6"></div>

        <button onClick={saveSettings} className="btn-primary w-full">
          <Save size={18} /> Save Preferences
        </button>
        
        {status && (
          <p className={`text-center mt-4 text-sm font-medium ${status.includes('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>
            {status}
          </p>
        )}
      </div>
    </motion.div>
  );
}