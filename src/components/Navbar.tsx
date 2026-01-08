import React from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import { User } from 'firebase/auth';
import { LogOut, Settings as SettingsIcon, Layout } from 'lucide-react';

interface NavbarProps {
  user: User;
}

export default function Navbar({ user }: NavbarProps) {
  return (
    <nav className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
        <Link to="/" className="font-bold text-xl tracking-tight text-white flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>
          WorkFlow
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/" className="text-slate-400 hover:text-white transition"><Layout size={20} /></Link>
          <Link to="/settings" className="text-slate-400 hover:text-white transition"><SettingsIcon size={20} /></Link>
          <div className="flex items-center gap-3 pl-6 border-l border-white/10">
            {user.photoURL && (
              <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-white/20" />
            )}
            <button onClick={() => auth.signOut()} className="text-xs text-slate-400 hover:text-red-400 transition flex gap-1 items-center">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}