import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';

export default function Settings({ user }) {
  const [categories, setCategories] = useState(['General', 'Urgent', 'Deep Work']);
  const [newCat, setNewCat] = useState('');
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.categories) setCategories(data.categories);
        if (data.emailNotifications) setEmailNotifs(data.emailNotifications);
      }
    };
    fetchSettings();
  }, [user]);

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, 'users', user.uid), {
        categories,
        emailNotifications: emailNotifs,
        email: user.email // Store email for the backend trigger
      }, { merge: true });
      setSaveStatus('Settings saved successfully.');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const addCategory = () => {
    if (newCat && !categories.includes(newCat)) {
      setCategories([...categories, newCat]);
      setNewCat('');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      
      <div className="glass-panel p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 text-indigo-300">Task Categories</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat, i) => (
            <span key={i} className="bg-slate-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
              {cat}
              <button onClick={() => setCategories(categories.filter(c => c !== cat))} className="hover:text-red-400">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input 
            value={newCat} 
            onChange={(e) => setNewCat(e.target.value)} 
            className="input-field py-2" 
            placeholder="Add new category..." 
          />
          <button onClick={addCategory} className="btn-primary py-2 px-4">+</button>
        </div>
      </div>

      <div className="glass-panel p-6 mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-indigo-300">Daily Email Briefing</h3>
          <p className="text-sm text-slate-400">Receive a summary of pending tasks at 9:00 AM.</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={emailNotifs} onChange={(e) => setEmailNotifs(e.target.checked)} className="sr-only peer" />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
      </div>

      <button onClick={saveSettings} className="btn-primary w-full">Save Changes</button>
      {saveStatus && <p className="text-green-400 text-center mt-4 text-sm">{saveStatus}</p>}
    </motion.div>
  );
}