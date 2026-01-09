import { useState, useEffect } from "react";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, confirmPasswordReset } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "../firebase";
import { LogIn, UserPlus, KeyRound, Mail, Lock, Phone, User, Check, AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

// 🌍 API Types
interface CountryData {
  name: { common: string };
  idd: { root: string; suffixes?: string[] };
  flags: { png: string; svg: string; alt: string };
  cca2: string;
}

interface FormattedCountry {
  code: string;
  dial_code: string;
  flag: string;
  name: string;
}

export default function Login() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [oobCode, setOobCode] = useState(''); // Store the reset code from URL

  // 🌍 Country API State
  const [countries, setCountries] = useState<FormattedCountry[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);

  // Form Data
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+44'); // Default UK

  // Password Rules
  const [pwdValid, setPwdValid] = useState({ length: false, upper: false, lower: false, number: false, special: false });

  // --- 1. DETECT RESET LINK FROM EMAIL ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    const codeParam = params.get('oobCode');

    if (modeParam === 'resetPassword' && codeParam) {
      setMode('reset');
      setOobCode(codeParam);
    }
  }, []);

  // --- FETCH FLAGS API ---
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await fetch('https://restcountries.com/v3.1/all?fields=name,idd,flags,cca2');
        const data: CountryData[] = await response.json();
        
        const formatted = data
          .filter(c => c.idd.root) 
          .map(c => ({
            code: c.cca2,
            name: c.name.common,
            flag: c.flags.svg, 
            dial_code: c.idd.root + (c.idd.suffixes ? c.idd.suffixes[0] : '')
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const priorityCodes = ['GB', 'US', 'IE', 'AU', 'IN'];
        const topCountries = priorityCodes.map(code => formatted.find(c => c.code === code)).filter(Boolean) as FormattedCountry[];
        const otherCountries = formatted.filter(c => !priorityCodes.includes(c.code));

        setCountries([...topCountries, ...otherCountries]);
      } catch (err) {
        setCountries([{ name: 'United Kingdom', dial_code: '+44', flag: 'https://flagcdn.com/gb.svg', code: 'GB' }]);
      } finally {
        setLoadingCountries(false);
      }
    };
    fetchCountries();
  }, []);

  const validatePassword = (pwd: string) => {
    setPwdValid({
      length: pwd.length >= 10,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
    });
  };

  const isPasswordValid = Object.values(pwdValid).every(Boolean);

  const handleGoogleLogin = async () => {
    setLoading(true); setError('');
    try { await signInWithPopup(auth, googleProvider); } 
    catch (err: any) { setError(err.message); } 
    finally { setLoading(false); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);

    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } 
      else if (mode === 'signup') {
        if (!isPasswordValid) throw new Error("Password does not meet security requirements.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: fullName });
        await setDoc(doc(db, "users", user.uid), {
          fullName,
          email,
          phone: `${countryCode} ${phone}`,
          createdAt: new Date()
        }, { merge: true });
      }
      else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setSuccess('Password reset link sent to your email.');
        setLoading(false);
        return;
      }
      else if (mode === 'reset') {
        if (!isPasswordValid) throw new Error("Password does not meet security requirements.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        
        await confirmPasswordReset(auth, oobCode, password);
        setSuccess('Password reset successfully! Redirecting to login...');
        setTimeout(() => {
            setMode('signin');
            setSuccess('');
            setPassword('');
            setConfirmPassword('');
            // Clear URL params so refresh doesn't trigger reset again
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 3000);
      }
    } catch (err: any) {
      let msg = err.message;
      if (msg.includes('auth/invalid-email')) msg = "Invalid email address.";
      if (msg.includes('auth/user-not-found')) msg = "No account found with this email.";
      if (msg.includes('auth/wrong-password')) msg = "Incorrect password.";
      if (msg.includes('auth/email-already-in-use')) msg = "Email already in use. Please sign in.";
      if (msg.includes('auth/invalid-action-code')) msg = "This reset link has expired or already been used.";
      setError(msg);
    } finally {
      if (mode !== 'forgot' && mode !== 'reset') setLoading(false);
      if (mode === 'reset' && error) setLoading(false); // Stop loading on reset error
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100">
      <div className="glass-panel p-8 w-full max-w-md relative overflow-hidden">
        {/* Glow Effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 text-center">
          <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            {mode === 'signin' && <LogIn size={32} />}
            {mode === 'signup' && <UserPlus size={32} />}
            {mode === 'forgot' && <KeyRound size={32} />}
            {mode === 'reset' && <ShieldCheck size={32} />}
          </div>
          
          <h1 className="text-2xl font-bold mb-2">
            {mode === 'signin' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Reset Password' : 'Set New Password'}
          </h1>
          <p className="text-slate-400 mb-6 text-sm">
            {mode === 'signin' ? 'Sign in to access your clinical workspace.' : 
             mode === 'signup' ? 'Join the platform for efficient management.' : 
             mode === 'forgot' ? 'Enter your email to receive a reset link.' :
             'Secure your account with a strong new password.'}
          </p>

          {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm p-3 rounded-lg mb-4 flex items-center gap-2 text-left"><AlertCircle size={16} className="shrink-0" /> {error}</div>}
          {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-3 rounded-lg mb-4 flex items-center gap-2 text-left"><Check size={16} className="shrink-0" /> {success}</div>}

          <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
            
            {/* --- SIGN UP FIELDS --- */}
            {mode === 'signup' && (
              <>
                <div>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="text" placeholder="Full Name" required value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-indigo-500 outline-none transition-all placeholder-slate-600" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative w-[110px]">
                    {loadingCountries ? (
                      <div className="w-full h-full bg-slate-900/50 border border-slate-700/50 rounded-xl flex items-center justify-center">
                        <Loader2 size={16} className="animate-spin text-slate-500"/>
                      </div>
                    ) : (
                      <>
                        <select 
                          value={countryCode} 
                          onChange={e => setCountryCode(e.target.value)} 
                          className="w-full h-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-8 pr-2 py-3 text-sm appearance-none outline-none cursor-pointer"
                        >
                          {countries.map(c => (
                            <option key={`${c.code}-${c.dial_code}`} value={c.dial_code}>
                              {c.dial_code}
                            </option>
                          ))}
                        </select>
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                           <img 
                             src={countries.find(c => c.dial_code === countryCode)?.flag} 
                             alt="flag" 
                             className="w-5 h-3.5 object-cover rounded-sm"
                           />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="relative flex-1">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="tel" placeholder="Mobile Number" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-indigo-500 outline-none transition-all placeholder-slate-600" />
                  </div>
                </div>
              </>
            )}

            {/* --- EMAIL (Not for Reset Mode) --- */}
            {mode !== 'reset' && (
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-indigo-500 outline-none transition-all placeholder-slate-600" />
              </div>
            )}

            {/* --- PASSWORD FIELDS (For Sign In, Sign Up, and Reset) --- */}
            {mode !== 'forgot' && (
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="password" 
                  placeholder={mode === 'reset' ? "New Password" : "Password"} 
                  required 
                  value={password} 
                  onChange={e => { setPassword(e.target.value); if(mode==='signup' || mode === 'reset') validatePassword(e.target.value); }} 
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-indigo-500 outline-none transition-all placeholder-slate-600" 
                />
              </div>
            )}

            {/* --- PASSWORD RULES & CONFIRM (For Sign Up and Reset) --- */}
            {(mode === 'signup' || mode === 'reset') && (
              <>
                <div className="text-[10px] grid grid-cols-2 gap-2 p-2 bg-slate-800/30 rounded-lg border border-white/5">
                  <span className={pwdValid.length ? "text-emerald-400" : "text-slate-500"}>• 10+ Characters</span>
                  <span className={pwdValid.upper ? "text-emerald-400" : "text-slate-500"}>• Uppercase</span>
                  <span className={pwdValid.lower ? "text-emerald-400" : "text-slate-500"}>• Lowercase</span>
                  <span className={pwdValid.number ? "text-emerald-400" : "text-slate-500"}>• Number</span>
                  <span className={pwdValid.special ? "text-emerald-400" : "text-slate-500"}>• Special Char</span>
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input type="password" placeholder="Confirm Password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-indigo-500 outline-none transition-all placeholder-slate-600" />
                </div>
              </>
            )}

            <button disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Processing...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : mode === 'reset' ? 'Update Password' : 'Send Reset Link'}
            </button>
          </form>

          {/* --- GOOGLE SIGN IN (Only for Sign In/Up) --- */}
          {(mode === 'signin' || mode === 'signup') && (
            <>
              <div className="my-6 flex items-center gap-4 opacity-50">
                <div className="h-[1px] bg-slate-600 flex-1"></div>
                <span className="text-xs text-slate-400">OR</span>
                <div className="h-[1px] bg-slate-600 flex-1"></div>
              </div>
              <button onClick={handleGoogleLogin} disabled={loading} className="w-full bg-white text-slate-900 hover:bg-slate-200 font-bold py-3 rounded-xl flex items-center justify-center gap-3 transition-colors">
                <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" /> Sign in with Google
              </button>
            </>
          )}

          {/* --- LINKS --- */}
          <div className="mt-6 text-sm text-slate-400 space-y-2">
            {mode === 'signin' && (
              <>
                <button onClick={() => setMode('forgot')} className="hover:text-white transition">Forgot password?</button>
                <div>Don't have an account? <button onClick={() => setMode('signup')} className="text-indigo-400 hover:text-indigo-300 font-medium">Sign up</button></div>
              </>
            )}
            {mode === 'signup' && (
              <div>Already have an account? <button onClick={() => setMode('signin')} className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</button></div>
            )}
            {(mode === 'forgot' || mode === 'reset') && (
              <button onClick={() => setMode('signin')} className="flex items-center justify-center gap-2 hover:text-white transition mx-auto"><ArrowLeft size={14} /> Back to Sign In</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}