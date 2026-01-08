import React from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { motion } from 'framer-motion';

export default function Login() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div className="h-[80vh] flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-10 text-center max-w-md w-full"
      >
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          WorkFlow '26
        </h1>
        <p className="text-slate-400 mb-8">Organise your work with clarity.</p>
        <button onClick={handleLogin} className="btn-primary w-full flex items-center justify-center gap-3">
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" />
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );
}