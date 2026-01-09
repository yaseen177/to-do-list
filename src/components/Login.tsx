import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { LogIn } from "lucide-react";

export default function Login() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100">
      <div className="glass-panel p-8 text-center max-w-sm w-full">
        <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <LogIn size={32} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Clinical Admin</h1>
        <p className="text-slate-400 mb-8">Sign in to manage your workspace.</p>
        
        <button 
          onClick={handleLogin}
          className="w-full bg-white text-slate-900 hover:bg-slate-200 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-colors"
        >
          <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}