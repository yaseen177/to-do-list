import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import Dashboard from './components/Dashboard';
import Login from './components/Login';

// Loading Spinner Component
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-500">
    <div className="animate-pulse flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      <span className="text-sm font-medium">Loading workspace...</span>
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <>
      {user ? <Dashboard user={user} /> : <Login />}
    </>
  );
}