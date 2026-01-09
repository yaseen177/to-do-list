import { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { signOut, updatePassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
// FIX 1: Added AlertCircle to imports
import { CheckCircle2, Circle, Trash2, Plus, Calendar as CalendarIcon, Clock, Pencil, X, Check, Eye, EyeOff, Search, User as UserIcon, Target, ChevronDown, ChevronRight, ChevronLeft, Hourglass, AlertTriangle, LayoutTemplate, KanbanSquare, Flag, Activity, Settings, Save, Moon, RefreshCw, LogOut, Lock, ShieldCheck, Tag, Sun, Layers, Globe, Link2, StickyNote, Undo2, AlertCircle } from 'lucide-react';
import { format, isPast, parseISO, intervalToDuration, addHours, isBefore, differenceInCalendarWeeks, startOfWeek, subWeeks, addDays, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

// --- TYPES ---
interface Todo {
  id: string;
  text: string;
  patientName: string;
  completed: boolean;
  status: 'todo' | 'in-progress' | 'waiting' | 'done';
  priority: 'low' | 'medium' | 'high';
  uid: string;
  category: string;
  dueDate: string;
  dueTime: string;
  notes?: string;
  createdAt: any; 
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  source: 'google' | 'outlook';
  color: string;
  calendarName?: string;
}

interface ExternalCalendar {
  id: string;
  name: string;
  source: 'google' | 'outlook';
  isActive: boolean;
}

interface ToastMsg {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  undoAction?: () => void;
}

type DaySchedule = { start: string; end: string; isOff: boolean };
type WeeklySchedule = Record<string, DaySchedule>;
type RotaSystem = WeeklySchedule[]; 

const DEFAULT_DAY: DaySchedule = { start: '09:00', end: '17:30', isOff: false };
const DEFAULT_WEEK: WeeklySchedule = {
  monday: { ...DEFAULT_DAY }, tuesday: { ...DEFAULT_DAY }, wednesday: { ...DEFAULT_DAY },
  thursday: { ...DEFAULT_DAY }, friday: { ...DEFAULT_DAY },
  saturday: { start: '09:00', end: '13:00', isOff: false },
  sunday: { start: '00:00', end: '00:00', isOff: true },
};

interface DashboardProps {
  user: User;
}

const QUICK_TEMPLATES = ["Referral", "GOS18", "Notes", "Order", "Phone Call"];
const TIME_SLOTS = Array.from({ length: 23 }).map((_, i) => {
  const totalMinutes = (8 * 60) + (i * 30);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
});

// --- HELPER FUNCTIONS ---
const getDayName = (dateStr: string) => {
  if (!dateStr) return 'monday';
  const date = parseISO(dateStr);
  return format(date, 'EEEE').toLowerCase(); 
};

const getShiftEndTime = (dateStr: string, rotas: RotaSystem, anchorDateStr?: string) => {
  if (!rotas || rotas.length === 0) return '17:30';
  const targetDate = parseISO(dateStr);
  const day = getDayName(dateStr);
  const anchor = anchorDateStr ? parseISO(anchorDateStr) : startOfWeek(new Date(), { weekStartsOn: 1 });
  const weeksPassed = differenceInCalendarWeeks(targetDate, anchor, { weekStartsOn: 1 });
  const cycleIndex = ((weeksPassed % rotas.length) + rotas.length) % rotas.length;
  const currentSchedule = rotas[cycleIndex];
  const daySettings = currentSchedule[day] || DEFAULT_WEEK.monday;
  if (daySettings.isOff) return '17:30'; 
  return daySettings.end;
};

const getTimeRemaining = (dueDateStr: string, dueTimeStr: string | undefined, now: Date) => {
  if (!dueDateStr) return null;
  const due = parseISO(dueDateStr);
  if (dueTimeStr) {
    const [hours, mins] = dueTimeStr.split(':').map(Number);
    due.setHours(hours, mins, 0);
  } else {
    due.setHours(23, 59, 59);
  }
  if (isPast(due)) return { text: 'Overdue', color: 'text-rose-500 font-bold' };
  const duration = intervalToDuration({ start: now, end: due });
  const parts = [];
  if (duration.days) parts.push(`${duration.days}d`);
  if (duration.hours) parts.push(`${duration.hours}h`);
  const text = parts.slice(0, 2).join(' ') + ' left'; 
  let color = 'text-indigo-500 dark:text-indigo-300';
  if (!duration.months && !duration.days && duration.hours && duration.hours < 4) color = 'text-amber-500 dark:text-amber-400 font-bold';
  return { text, color };
};

const getTimeWaiting = (createdAt: any, now: Date) => {
  if (!createdAt) return 'Just now';
  const createdDate = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date();
  const duration = intervalToDuration({ start: createdDate, end: now });
  const parts = [];
  if (duration.days) parts.push(`${duration.days}d`);
  if (duration.hours) parts.push(`${duration.hours}h`);
  return parts.length > 0 ? parts.join(' ') : 'Just now';
};

// --- CALENDAR MANAGER MODAL ---
const CalendarManagerModal = ({ isOpen, onClose, outlookConnected, outlookExpired, googleConnected, onConnectOutlook, onConnectGoogle, onDisconnect, calendars, toggleCalendar }: any) => {
  if (!isOpen) return null;
  const outlookCalendars = calendars.filter((c: any) => c.source === 'outlook');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2"><Globe size={18} /> Manage Calendars</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* GOOGLE */}
          <div className="space-y-3">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700 dark:text-white font-bold text-sm"><img src="https://www.google.com/favicon.ico" alt="G" className="w-4 h-4"/> Google Calendar</div>
                {googleConnected ? (<button onClick={() => onDisconnect('google')} className="text-[10px] bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 px-2 py-1 rounded hover:opacity-80">Disconnect</button>) : (<button onClick={onConnectGoogle} className="text-[10px] bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-500">Connect</button>)}
             </div>
             {googleConnected && (
               <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase font-bold px-2">Sub-Calendars</div>
                  <div className="flex items-center gap-2 p-2 rounded cursor-not-allowed opacity-70"><CheckCircle2 size={14} className="text-emerald-500"/><span className="text-xs text-slate-600 dark:text-slate-300">Primary Calendar</span></div>
               </div>
             )}
          </div>
          {/* OUTLOOK */}
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700 dark:text-white font-bold text-sm">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20px" height="20px"><path fill="#0078d4" d="M19,7h23c0.6,0,1,0.4,1,1v32c0,0.6-0.4,1-1,1H19c-0.6,0-1-0.4-1-1V8C18,7.4,18.4,7,19,7z"/><path fill="#2b5a8e" d="M12,13v22c0,0.6,0.4,1,1,1h6V12h-6C12.4,12,12,12.4,12,13z"/><path fill="#5ea9f5" d="M30,22h8v7h-8V22z"/><path fill="#ffffff" d="M36.5,23.5L34,26l-2.5-2.5l-1,1l2.5,2.5l-2.5,2.5l1,1l2.5-2.5l2.5,2.5l1-1l-2.5-2.5l2.5-2.5L36.5,23.5z"/><path fill="#ffffff" d="M16 16.5A2.5 2.5 0 1 0 16 21.5 2.5 2.5 0 1 0 16 16.5z"/></svg>Outlook Calendar
                </div>
                {outlookConnected ? (outlookExpired ? (<button onClick={onConnectOutlook} className="text-[10px] bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 px-3 py-1 rounded hover:opacity-80 flex items-center gap-1"><RefreshCw size={10}/> Refresh</button>) : (<button onClick={() => onDisconnect('outlook')} className="text-[10px] bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 px-2 py-1 rounded hover:opacity-80">Disconnect</button>)) : (<button onClick={onConnectOutlook} className="text-[10px] bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-500">Connect</button>)}
             </div>
             {outlookConnected && (
               <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2 space-y-1">
                  {outlookExpired ? (<div className="flex items-center gap-2 p-2 text-amber-600 dark:text-amber-400 text-xs"><AlertCircle size={14}/><span>Session expired. Please refresh.</span></div>) : (
                    <>
                      <div className="text-[10px] text-slate-500 uppercase font-bold px-2 mb-1">Select Calendars</div>
                      {outlookCalendars.length === 0 && <div className="text-xs text-slate-500 px-2 italic">Loading...</div>}
                      {outlookCalendars.map((cal: ExternalCalendar) => (
                        <button key={cal.id} onClick={() => toggleCalendar(cal.id)} className="w-full flex items-center gap-2 p-2 hover:bg-slate-200 dark:hover:bg-white/5 rounded transition text-left">
                          {cal.isActive ? <CheckCircle2 size={16} className="text-sky-500 dark:text-sky-400"/> : <Circle size={16} className="text-slate-400"/>}
                          <span className={`text-xs ${cal.isActive ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>{cal.name}</span>
                        </button>
                      ))}
                    </>
                  )}
               </div>
             )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// --- SETTINGS MODAL ---
const SettingsModal = ({ isOpen, onClose, rotas, onSaveRotas, anchorDate, user, categories, isDark, setIsDark }: any) => {
  const [activeTab, setActiveTab] = useState<'rota' | 'categories' | 'account' | 'appearance'>('rota');
  const [localRotas, setLocalRotas] = useState<RotaSystem>(rotas);
  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [currentWeekSelection, setCurrentWeekSelection] = useState(0);
  const [localCategories, setLocalCategories] = useState<string[]>(categories || []);
  const [newCat, setNewCat] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });
  const isGoogleAuth = user.providerData.some((p: any) => p.providerId === 'google.com');

  useEffect(() => {
    if (rotas) setLocalRotas(rotas);
    if (categories) setLocalCategories(categories);
    if (anchorDate && rotas.length > 0) {
        const anchor = parseISO(anchorDate);
        const weeksPassed = differenceInCalendarWeeks(new Date(), anchor, { weekStartsOn: 1 });
        const currentIndex = ((weeksPassed % rotas.length) + rotas.length) % rotas.length;
        setCurrentWeekSelection(currentIndex);
    }
  }, [rotas, anchorDate, categories]);

  if (!isOpen) return null;

  const handleRotaChange = (day: string, field: keyof DaySchedule, value: any) => { const updatedRotas = [...localRotas]; updatedRotas[activeWeekIndex] = { ...updatedRotas[activeWeekIndex], [day]: { ...updatedRotas[activeWeekIndex][day], [field]: value } }; setLocalRotas(updatedRotas); };
  const addWeek = () => { setLocalRotas([...localRotas, JSON.parse(JSON.stringify(DEFAULT_WEEK))]); setActiveWeekIndex(localRotas.length); };
  const removeWeek = (index: number) => { if(localRotas.length<=1)return; setLocalRotas(localRotas.filter((_,i)=>i!==index)); setActiveWeekIndex(0); };
  const handleSaveRota = () => { const today = new Date(); const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); const newAnchorDate = subWeeks(startOfCurrentWeek, currentWeekSelection); const newAnchorStr = format(newAnchorDate, 'yyyy-MM-dd'); onSaveRotas(localRotas, newAnchorStr); };
  const handleAddCategory = () => { if (newCat.trim() && !localCategories.includes(newCat.trim())) { setLocalCategories([...localCategories, newCat.trim()]); setNewCat(''); } };
  const handleRemoveCategory = (cat: string) => { setLocalCategories(localCategories.filter(c => c !== cat)); };
  const handleSaveCategories = async () => { setSaveStatus('saving'); try { await setDoc(doc(db, "users", user.uid), { categories: localCategories }, { merge: true }); setSaveStatus('success'); setTimeout(() => { setSaveStatus('idle'); onClose(); }, 1000); } catch (e) { console.error(e); setSaveStatus('idle'); } };
  const handleUpdatePassword = async () => { if (newPassword.length < 8) { setPasswordMsg({ text: 'Password too short', type: 'error' }); return; } if (newPassword !== confirmPassword) { setPasswordMsg({ text: 'Passwords do not match', type: 'error' }); return; } try { if (user) { await updatePassword(user, newPassword); setPasswordMsg({ text: 'Password updated!', type: 'success' }); setNewPassword(''); setConfirmPassword(''); } } catch (err: any) { setPasswordMsg({ text: err.message, type: 'error' }); } };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Settings size={20} /> Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
        </div>
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          {['rota', 'categories', 'account', 'appearance'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 text-sm font-medium transition capitalize ${activeTab === tab ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-500/5' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{tab}</button>
          ))}
        </div>
        
        {activeTab === 'rota' && (
          <>
            <div className="bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/20 p-4"><div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-indigo-700 dark:text-indigo-200 flex items-center gap-2"><RefreshCw size={14}/> Sync Current Week</span><span className="text-xs text-indigo-600 dark:text-indigo-300/60">{format(new Date(), 'd MMM')}</span></div><div className="flex items-center gap-3"><span className="text-sm text-slate-600 dark:text-slate-300">This week is:</span><div className="relative flex-1"><select value={currentWeekSelection} onChange={(e) => setCurrentWeekSelection(Number(e.target.value))} className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white text-sm rounded-lg px-3 py-2 appearance-none cursor-pointer focus:border-indigo-500 focus:outline-none">{localRotas.map((_, idx) => (<option key={idx} value={idx}>Week {idx + 1}</option>))}</select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div></div>
            <div className="flex items-center gap-2 px-6 pt-4 pb-2 overflow-x-auto scrollbar-hide">{localRotas.map((_, idx) => (<div key={idx} className="flex items-center"><button onClick={() => setActiveWeekIndex(idx)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${activeWeekIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>Week {idx + 1}</button>{localRotas.length > 1 && activeWeekIndex === idx && <button onClick={() => removeWeek(idx)} className="ml-1 p-1 text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-full"><X size={12} /></button>}</div>))}<button onClick={addWeek} className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-500 transition"><Plus size={14} /></button></div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => { const dayData = (localRotas[activeWeekIndex] || DEFAULT_WEEK)[day] || DEFAULT_WEEK.monday; return (<div key={day} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/50"><div className="w-24 capitalize text-sm font-medium text-slate-700 dark:text-slate-200">{day}</div>{!dayData.isOff ? (<><input type="time" value={dayData.start} onChange={(e) => handleRotaChange(day, 'start', e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm text-slate-800 dark:text-white" /><span className="text-slate-500">-</span><input type="time" value={dayData.end} onChange={(e) => handleRotaChange(day, 'end', e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm text-slate-800 dark:text-white" /></>) : <span className="flex-1 text-center text-xs text-slate-500 uppercase tracking-wider font-bold">Day Off</span>}<button onClick={() => handleRotaChange(day, 'isOff', !dayData.isOff)} className={`px-3 py-1 rounded text-xs font-bold transition ${dayData.isOff ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>{dayData.isOff ? 'OFF' : 'ON'}</button></div>); })}</div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 sticky bottom-0"><button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">Cancel</button><button onClick={handleSaveRota} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Save size={16} /> Save Rota</button></div>
          </>
        )}

        {/* --- CATEGORIES TAB --- */}
        {activeTab === 'categories' && (
          <>
            <div className="flex-1 flex flex-col min-h-0"><div className="p-6 space-y-6 overflow-y-auto flex-1"><div className="flex gap-2"><input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} placeholder="New Category Name..." className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-white focus:border-indigo-500 outline-none"/><button onClick={handleAddCategory} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded-lg"><Plus size={20}/></button></div><div className="space-y-2">{localCategories.map(cat => (<div key={cat} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-lg group"><span className="text-slate-700 dark:text-slate-200 text-sm font-medium">{cat}</span><button onClick={() => handleRemoveCategory(cat)} className="text-slate-400 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button></div>))}{localCategories.length === 0 && <div className="text-center text-slate-500 text-sm py-4">No categories set.</div>}</div></div></div><div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 sticky bottom-0"><button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">Close</button><button onClick={handleSaveCategories} disabled={saveStatus !== 'idle'} className={`px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${saveStatus === 'success' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>{saveStatus === 'saving' ? <>Saving...</> : saveStatus === 'success' ? <><Check size={16}/> Saved!</> : <><Save size={16}/> Save Categories</>}</button></div>
          </>
        )}

        {/* --- ACCOUNT TAB --- */}
        {activeTab === 'account' && (
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
             <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50"><h3 className="text-slate-800 dark:text-white font-bold flex items-center gap-2 mb-4"><Lock size={18} className="text-indigo-500"/> Authentication</h3>{isGoogleAuth ? (<div className="flex flex-col items-center justify-center py-4 space-y-3"><div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg"><img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" /></div><div className="text-center"><p className="text-slate-800 dark:text-white font-medium">Connected with Google</p><p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[200px]">Password & Security are managed via your Google Account.</p></div></div>) : (<div className="space-y-4"><label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Change Password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-white text-sm focus:border-indigo-500 outline-none" placeholder="New Password" /><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-white text-sm focus:border-indigo-500 outline-none" placeholder="Confirm Password" />{passwordMsg.text && <div className={`text-xs p-2 rounded ${passwordMsg.type === 'error' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>{passwordMsg.text}</div>}<button onClick={handleUpdatePassword} className="w-full py-2 bg-slate-200 dark:bg-slate-700 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-white rounded-lg text-sm font-medium transition">Update Password</button></div>)}</div>
             <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700/30"><h3 className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-2 mb-2"><ShieldCheck size={18}/> Data Privacy</h3><p className="text-xs text-slate-500 leading-relaxed">Your data is stored securely in compliance with UK GDPR standards.</p></div>
          </div>
        )}

        {/* --- APPEARANCE TAB --- */}
        {activeTab === 'appearance' && (
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
             <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
                <h3 className="text-slate-800 dark:text-white font-bold flex items-center gap-2 mb-4"><Sun size={18} className="text-indigo-500"/> Theme Preferences</h3>
                <div className="flex items-center justify-between">
                   <span className="text-sm text-slate-600 dark:text-slate-300">Dark Mode</span>
                   <button onClick={() => setIsDark(!isDark)} className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${isDark ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isDark ? 'translate-x-6' : ''}`}></div>
                   </button>
                </div>
             </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// --- CALENDAR VIEW COMPONENT (UPDATED) ---
const CalendarView = ({ todos, currentDate, setCurrentDate, onEdit, googleEvents, outlookEvents, visibleCalendars, setVisibleCalendars, setIsManagerOpen }: any) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const allDays = eachDayOfInterval({ start: startDate, end: endDate });
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">{format(currentDate, "MMMM yyyy")}</h2>
          <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-0.5">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-white dark:hover:bg-white/10 rounded"><ChevronLeft size={20} className="text-slate-500 dark:text-slate-300" /></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">Today</button>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-white dark:hover:bg-white/10 rounded"><ChevronRight size={20} className="text-slate-500 dark:text-slate-300" /></button>
          </div>
        </div>
        
        <div className="flex gap-2">
           <button onClick={() => setIsManagerOpen(true)} className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition"><Link2 size={14} /> Connect Accounts</button>
           <div className="relative">
             <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition"><Layers size={14} /> Filter</button>
             {isFilterOpen && (
               <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-2">
                  <button onClick={() => setVisibleCalendars({...visibleCalendars, tasks: !visibleCalendars.tasks})} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2 text-xs text-slate-700 dark:text-white">{visibleCalendars.tasks ? <CheckCircle2 size={14} className="text-indigo-500"/> : <Circle size={14} className="text-slate-400"/>} Tasks (Local)</button>
                  <button onClick={() => setVisibleCalendars({...visibleCalendars, google: !visibleCalendars.google})} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2 text-xs text-slate-700 dark:text-white">{visibleCalendars.google ? <CheckCircle2 size={14} className="text-emerald-500"/> : <Circle size={14} className="text-slate-400"/>} Google Calendar</button>
                  <button onClick={() => setVisibleCalendars({...visibleCalendars, outlook: !visibleCalendars.outlook})} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2 text-xs text-slate-700 dark:text-white">{visibleCalendars.outlook ? <CheckCircle2 size={14} className="text-sky-500"/> : <Circle size={14} className="text-slate-400"/>} Outlook</button>
               </div>
             )}
           </div>
        </div>
      </div>
      <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-center py-2">{weekDays.map(d => <div key={d} className="text-xs font-bold text-slate-500 uppercase tracking-wider">{d}</div>)}</div>
      <div className="grid grid-cols-7 auto-rows-fr bg-white dark:bg-slate-900">
        {allDays.map((dayItem) => {
          const dayString = format(dayItem, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(dayItem, monthStart);
          const isToday = isSameDay(dayItem, new Date());
          const daysTasks = visibleCalendars.tasks ? todos.filter((t: Todo) => t.dueDate === dayString) : [];
          const daysGoogle = visibleCalendars.google ? googleEvents.filter((e: CalendarEvent) => isSameDay(e.start, dayItem)) : [];
          const daysOutlook = visibleCalendars.outlook ? outlookEvents.filter((e: CalendarEvent) => isSameDay(e.start, dayItem)) : [];

          return (
            <div key={dayString} className={`min-h-[100px] p-2 border-b border-r border-slate-200 dark:border-slate-800/50 flex flex-col gap-1 transition-colors ${!isCurrentMonth ? 'bg-slate-50 dark:bg-slate-900/30 text-slate-400 dark:text-slate-600' : 'bg-transparent text-slate-600 dark:text-slate-300'} ${isToday ? 'bg-indigo-50 dark:bg-indigo-500/5' : ''}`}>
              <div className="flex justify-between items-start"><span className={`text-sm font-medium ${isToday ? 'bg-indigo-600 text-white w-6 h-6 flex items-center justify-center rounded-full shadow-lg shadow-indigo-500/50' : ''}`}>{format(dayItem, 'd')}</span></div>
              <div className="flex-1 flex flex-col gap-1 mt-1 overflow-y-auto max-h-[80px] scrollbar-hide">
                {daysTasks.map((t: Todo) => (<button key={t.id} onClick={() => onEdit(t)} className={`text-left text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 hover:opacity-80 transition active:scale-95 ${t.completed ? 'opacity-40 line-through bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500' : t.priority === 'high' ? 'bg-rose-100 dark:bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-300' : t.priority === 'medium' ? 'bg-amber-100 dark:bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-300'}`}>{t.patientName ? <span className="font-bold mr-1">{t.patientName}</span> : null}{t.text}</button>))}
                {daysGoogle.map((e: CalendarEvent) => (<div key={e.id} className="text-left text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 bg-emerald-100 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-300" title="Google Calendar Event">{e.title}</div>))}
                {daysOutlook.map((e: CalendarEvent) => (<div key={e.id} className="text-left text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 bg-sky-100 dark:bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-300" title={`Outlook: ${e.calendarName || 'Event'}`}>{e.title}</div>))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- EDIT TASK MODAL (Updated with Notes) ---
const EditTaskModal = ({ isOpen, onClose, todo, onSave, onDelete, categories, rotas, anchorDate }: any) => {
  const [form, setForm] = useState(todo || {});
  useEffect(() => { if (todo) setForm(todo); }, [todo]);
  if (!isOpen || !todo) return null;
  const handleSave = () => { onSave(todo.id, form); onClose(); };
  const setSmartTime = (type: 'today' | 'tomorrow') => { const date = type === 'today' ? new Date() : addDays(new Date(), 1); const dateStr = format(date, 'yyyy-MM-dd'); const timeStr = getShiftEndTime(dateStr, rotas, anchorDate); setForm({ ...form, dueDate: dateStr, dueTime: timeStr }); };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"><div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center"><h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2"><Pencil size={18} /> Edit Task</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button></div><div className="p-6 space-y-5"><div className="flex gap-4"><div className="flex-1 space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">Category</label><div className="relative"><select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-white text-sm appearance-none outline-none focus:border-indigo-500">{categories.map((c: string) => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div><div className="flex-1 space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">Priority</label><div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">{['low', 'medium', 'high'].map(p => (<button key={p} onClick={() => setForm({...form, priority: p})} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded transition ${form.priority === p ? (p==='high'?'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400':p==='medium'?'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400':'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400') : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{p}</button>))}</div></div></div><div className="space-y-3"><div className="relative"><UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={form.patientName} onChange={e => setForm({...form, patientName: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-indigo-500 outline-none" placeholder="Patient Name" /></div><textarea value={form.text} onChange={e => setForm({...form, text: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-indigo-500 outline-none h-20 resize-none" placeholder="Task description..." /><div className="relative"><StickyNote size={16} className="absolute left-3 top-3 text-slate-500" /><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-indigo-500 outline-none h-20 resize-none" placeholder="Additional Notes..." /></div></div><div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">Deadline</label><div className="flex gap-2"><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-white text-sm outline-none focus:border-indigo-500" /><input type="time" value={form.dueTime} onChange={e => setForm({...form, dueTime: e.target.value})} className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-white text-sm outline-none focus:border-indigo-500" /><button onClick={() => setSmartTime('today')} className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-amber-500 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-white/5" title="End of Today"><Moon size={18}/></button><button onClick={() => setSmartTime('tomorrow')} className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sky-500 dark:text-sky-400 hover:bg-slate-200 dark:hover:bg-white/5" title="End of Tomorrow"><Sun size={18}/></button></div></div></div><div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center"><button onClick={() => { if(confirm('Delete this task?')) { onDelete(todo.id); onClose(); } }} className="text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/10 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Trash2 size={16}/> Delete</button><div className="flex gap-2"><button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">Cancel</button><button onClick={handleSave} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">Save Changes</button></div></div></motion.div>
    </div>
  );
};

// --- TASK ITEM COMPONENT (UPDATED WITH DRAG & NOTES) ---
const TaskItem = ({ todo, now, onEdit, deleteTodo, toggleComplete, privacyMode, updateStatus }: any) => {
  const remaining = getTimeRemaining(todo.dueDate, todo.dueTime, now);
  const waiting = getTimeWaiting(todo.createdAt, now);
  const createdStr = todo.createdAt?.seconds ? format(new Date(todo.createdAt.seconds * 1000), 'd MMM') : 'Now';
  const currentStatus = todo.status || 'todo'; 
  const currentPriority = todo.priority || 'medium';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("taskId", todo.id);
  };

  return (
    <motion.div 
      layout 
      draggable 
      onDragStart={(e: any) => handleDragStart(e)}
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, scale: 0.95 }} 
      className={`p-3 flex flex-col sm:flex-row sm:items-start justify-between group border-l-4 mb-3 rounded-lg shadow-sm backdrop-blur-md transition-all cursor-grab active:cursor-grabbing ${
        todo.completed 
          ? 'border-l-slate-400 bg-slate-100 dark:bg-slate-900/40 opacity-60' 
          : currentPriority === 'high' 
            ? 'border-l-rose-500 bg-white dark:bg-slate-900/40 shadow-rose-500/10' 
            : 'border-l-indigo-500 bg-white dark:bg-slate-900/40'
      } border border-slate-200 dark:border-slate-700/50`}
    >
      <div className="flex items-start gap-3 w-full">
        <button onClick={() => toggleComplete(todo)} className="text-slate-400 hover:text-indigo-500 transition mt-1">
          {todo.completed ? <CheckCircle2 className="text-emerald-500" size={22} /> : <Circle size={22} />}
        </button>
        <div className="flex-1 min-w-0">
            <div className={`${privacyMode ? 'blur-md hover:blur-none select-none duration-500' : ''}`}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {currentPriority === 'high' && <span className="animate-pulse text-rose-500"><AlertTriangle size={14} /></span>}
                {todo.patientName && <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-300 font-bold text-sm"><UserIcon size={12} /> {todo.patientName}</div>}
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">{todo.category}</span>
                {todo.notes && <span className="text-slate-400" title="Has notes"><StickyNote size={12}/></span>}
                <button onClick={() => updateStatus(todo)} className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ml-auto sm:ml-0 transition ${currentStatus === 'in-progress' ? 'border-sky-500/30 text-sky-500 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10' : currentStatus === 'waiting' ? 'border-amber-500/30 text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' : currentStatus === 'done' ? 'border-emerald-500/30 text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}>{currentStatus.replace('-', ' ')}</button>
              </div>
              <p className={`text-base transition-all ${todo.completed ? 'line-through decoration-slate-400 text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{todo.text}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400 border-t border-slate-100 dark:border-white/5 pt-2 w-full">
                <span className="flex items-center gap-1" title="Created"><Clock size={10} /> {createdStr}</span>
                <span className="flex items-center gap-1" title="Time Waiting"><Hourglass size={10} /> {waiting}</span>
                {remaining && !todo.completed && <span className={`font-medium flex items-center gap-1 ${remaining.color}`}><Target size={10}/> {remaining.text}</span>}
                {todo.dueDate && <span className="text-slate-500 dark:text-slate-300 flex items-center gap-1"><CalendarIcon size={10} /> {format(parseISO(todo.dueDate), 'd MMM')} {todo.dueTime}</span>}
              </div>
            </div>
        </div>
      </div>
      <div className="flex items-center gap-2 absolute top-3 right-3 sm:static sm:ml-4 self-start">
        <button onClick={() => onEdit(todo)} className="text-slate-400 hover:text-indigo-500 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded"><Pencil size={16} /></button>
        <button onClick={() => deleteTodo(todo.id)} className="text-slate-400 hover:text-rose-500 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded"><Trash2 size={16} /></button>
      </div>
    </motion.div>
  );
};

// --- TOAST NOTIFICATION COMPONENT ---
const ToastContainer = ({ toasts }: { toasts: ToastMsg[] }) => {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-full max-w-sm px-4">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div 
            key={toast.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`flex items-center justify-between p-3 rounded-xl shadow-lg border ${
              toast.type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 
              toast.type === 'error' ? 'bg-rose-500 border-rose-400 text-white' : 
              'bg-slate-800 border-slate-700 text-white'
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            {toast.undoAction && (
              <button onClick={toast.undoAction} className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition">
                <Undo2 size={12} /> Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// --- MAIN DASHBOARD ---
export default function Dashboard({ user }: DashboardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'board' | 'calendar'>('list'); 
  const [rotas, setRotas] = useState<RotaSystem>([DEFAULT_WEEK]); 
  const [anchorDate, setAnchorDate] = useState<string>(''); 
  const [calendarDate, setCalendarDate] = useState(new Date()); 
  
  // EXTERNAL CALENDARS STATE
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [outlookEvents, setOutlookEvents] = useState<CalendarEvent[]>([]);
  const [visibleCalendars, setVisibleCalendars] = useState({ tasks: true, google: true, outlook: true });
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookExpired, setOutlookExpired] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);

  // UI State
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [isSmartDateOpen, setIsSmartDateOpen] = useState(false);
  const [isTimeOpen, setIsTimeOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [editTask, setEditTask] = useState<Todo | null>(null);
  
  // THEME STATE
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');

  // TOAST STATE
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  // Input State
  const [input, setInput] = useState('');
  const [patientInput, setPatientInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [category, setCategory] = useState('General');
  const [priority, setPriority] = useState<'low'|'medium'|'high'>('medium');
  const [categories, setCategories] = useState<string[]>(['General']);
  const [isLoading, setIsLoading] = useState(true);

  // General State
  const [now, setNow] = useState(new Date());
  const [privacyMode, setPrivacyMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sections State
  const [sections, setSections] = useState({ overdue: true, soon: true, later: true, completed: false });
  const toggleSection = (key: keyof typeof sections) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Refs for click outside
  const timeRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const prioRef = useRef<HTMLDivElement>(null);

  // --- THEME EFFECT ---
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const clickOut = (e: MouseEvent) => {
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) setIsTimeOpen(false);
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setIsSmartDateOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setIsCatOpen(false);
      if (prioRef.current && !prioRef.current.contains(e.target as Node)) setIsPriorityOpen(false);
    };
    document.addEventListener("mousedown", clickOut);
    return () => document.removeEventListener("mousedown", clickOut);
  }, []);

  // --- FETCH DATA ---
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    const unsub = onSnapshot(query(collection(db, 'todos'), where('uid', '==', user.uid)), (snap) => {
      let tasks = snap.docs.map(d => ({ ...d.data(), id: d.id } as Todo));
      tasks.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high' && !a.completed) return -1;
        if (b.priority === 'high' && a.priority !== 'high' && !b.completed) return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
      setTodos(tasks);
      setIsLoading(false);
    });
    
    onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.categories && data.categories.length > 0) {
           setCategories(data.categories);
           setCategory(data.categories[0]); 
        }
        if (data.rotas) setRotas(data.rotas); 
        else if (data.schedule) setRotas([data.schedule]);
        if (data.anchorDate) setAnchorDate(data.anchorDate);
      }
    });

    return () => { clearInterval(timer); unsub(); };
  }, [user]);

  // --- CALENDAR INTEGRATION LOGIC ---
  const loadGoogleEvents = async (token: string) => {
    const start = startOfMonth(new Date()).toISOString();
    const end = endOfMonth(new Date()).toISOString();
    try {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const events = (data.items || []).map((e: any) => ({
          id: e.id,
          title: e.summary || 'Busy',
          start: new Date(e.start.dateTime || e.start.date),
          end: new Date(e.end.dateTime || e.end.date),
          source: 'google',
          color: 'emerald'
        }));
        setGoogleEvents(events);
        setGoogleConnected(true);
      }
    } catch (err) { console.error("Google Fetch Error", err); }
  };

  const loadOutlookData = async (token: string) => {
    try {
      const calRes = await fetch("https://graph.microsoft.com/v1.0/me/calendars", { headers: { Authorization: `Bearer ${token}` } });
      if (!calRes.ok) {
        if (calRes.status === 401) {
          setOutlookConnected(true); 
          setOutlookExpired(true);
        }
        return;
      }
      setOutlookExpired(false);
      const calData = await calRes.json();
      if (calData.value) {
        const existing = localStorage.getItem(`outlook_calendars_${user.uid}`);
        const savedState = existing ? JSON.parse(existing) : [];
        const mergedCalendars = calData.value.map((c: any) => {
           const wasActive = savedState.find((s:any) => s.id === c.id)?.isActive;
           return { id: c.id, name: c.name, source: 'outlook', isActive: wasActive !== undefined ? wasActive : c.isDefaultCalendar };
        });
        setExternalCalendars(prev => {
           const google = prev.filter(p => p.source === 'google');
           return [...google, ...mergedCalendars];
        });
        setOutlookConnected(true);
        const activeIds = mergedCalendars.filter((c:any) => c.isActive).map((c:any) => c.id);
        const allEvents: CalendarEvent[] = [];
        for (const calId of activeIds) {
           const eventRes = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${calId}/events`, { headers: { Authorization: `Bearer ${token}` } });
           const eventData = await eventRes.json();
           if (eventData.value) {
              const events = eventData.value.map((e: any) => ({
                id: e.id,
                title: e.subject,
                start: new Date(e.start.dateTime),
                end: new Date(e.end.dateTime),
                source: 'outlook',
                color: 'sky',
                calendarName: mergedCalendars.find((c:any) => c.id === calId)?.name
              }));
              allEvents.push(...events);
           }
        }
        setOutlookEvents(allEvents);
      }
    } catch (err) { console.error("Outlook API Error", err); }
  };

  useEffect(() => {
    const gToken = localStorage.getItem(`google_token_${user.uid}`);
    if (gToken) loadGoogleEvents(gToken);
    const outlookIntent = localStorage.getItem(`outlook_connected_${user.uid}`);
    if (outlookIntent === 'true') {
        const oToken = localStorage.getItem(`outlook_token_${user.uid}`);
        if (oToken) {
            loadOutlookData(oToken);
        } else {
            setOutlookConnected(true);
            setOutlookExpired(true);
        }
    }
    if (window.location.hash.includes("access_token")) {
      const token = new URLSearchParams(window.location.hash.substring(1)).get("access_token");
      if (token) {
        localStorage.setItem(`outlook_token_${user.uid}`, token);
        localStorage.setItem(`outlook_connected_${user.uid}`, 'true'); 
        window.history.replaceState(null, "", " ");
        loadOutlookData(token);
      }
    }
  }, [user]);

  const toggleCalendar = (id: string) => {
    const updated = externalCalendars.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c);
    setExternalCalendars(updated);
    localStorage.setItem(`outlook_calendars_${user.uid}`, JSON.stringify(updated.filter(c => c.source === 'outlook')));
    const cal = updated.find(c => c.id === id);
    if (cal && cal.source === 'outlook') {
       const token = localStorage.getItem(`outlook_token_${user.uid}`);
       if (token) loadOutlookData(token);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        localStorage.setItem(`google_token_${user.uid}`, token);
        loadGoogleEvents(token);
      }
    } catch (error: any) { alert(`Connection failed: ${error.message}`); }
  };

  const handleConnectOutlook = () => {
    const CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID; 
    const REDIRECT_URI = "http://localhost:5173"; 
    const SCOPES = "Calendars.Read";
    window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}`;
  };

  const handleDisconnectCalendar = (source: 'google' | 'outlook') => {
    if (source === 'google') {
      localStorage.removeItem(`google_token_${user.uid}`);
      setGoogleEvents([]);
      setGoogleConnected(false);
    } else {
      localStorage.removeItem(`outlook_token_${user.uid}`);
      localStorage.removeItem(`outlook_connected_${user.uid}`);
      localStorage.removeItem(`outlook_calendars_${user.uid}`);
      setOutlookEvents([]);
      setOutlookConnected(false);
      setOutlookExpired(false);
      setExternalCalendars(prev => prev.filter(c => c.source !== 'outlook'));
    }
  };

  // --- STATS & GROUPING ---
  const stats = useMemo(() => {
    return {
      total: todos.length,
      urgent: todos.filter(t => t.priority === 'high' && !t.completed).length,
      waiting: todos.filter(t => t.status === 'waiting' && !t.completed).length,
      completedToday: todos.filter(t => t.completed).length 
    };
  }, [todos]);

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    todos.forEach(t => {
      if (!t.completed && t.status !== 'done') {
        counts[t.category] = (counts[t.category] || 0) + 1;
      }
    });
    return counts;
  }, [todos]);

  const groupedTodos = useMemo(() => {
    const filtered = todos.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()) || (t.patientName && t.patientName.toLowerCase().includes(searchQuery.toLowerCase())));
    const list = { overdue: [] as Todo[], soon: [] as Todo[], later: [] as Todo[], completed: [] as Todo[] };
    const board = { todo: [] as Todo[], inProgress: [] as Todo[], waiting: [] as Todo[], done: [] as Todo[] };
    const next24h = addHours(now, 24);

    filtered.forEach(todo => {
      const status = todo.status || 'todo';
      const isComplete = todo.completed || status === 'done';
      if (isComplete) board.done.push(todo);
      else if (status === 'waiting') board.waiting.push(todo);
      else if (status === 'in-progress') board.inProgress.push(todo);
      else board.todo.push(todo);

      if (isComplete) { list.completed.push(todo); return; }
      if (!todo.dueDate) { list.later.push(todo); return; }
      const due = parseISO(todo.dueDate);
      if (todo.dueTime) { const [h, m] = todo.dueTime.split(':').map(Number); due.setHours(h, m, 0); } 
      else { due.setHours(23, 59, 59); }

      if (isBefore(due, now)) list.overdue.push(todo);
      else if (isBefore(due, next24h)) list.soon.push(todo);
      else list.later.push(todo);
    });
    return { list, board };
  }, [todos, searchQuery, now]);

  // --- ACTIONS ---
  const saveRotas = async (newRotas: RotaSystem, newAnchorDate: string) => {
    await setDoc(doc(db, "users", user.uid), { rotas: newRotas, anchorDate: newAnchorDate }, { merge: true });
    setIsSettingsOpen(false);
  };

  const handleSignOut = async () => { try { await signOut(auth); } catch (error) { console.error("Error signing out", error); } };

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !patientInput.trim()) return;
    await addDoc(collection(db, 'todos'), {
      text: input, patientName: patientInput, completed: false, status: 'todo', priority, uid: user.uid, category, dueDate, dueTime, createdAt: serverTimestamp()
    });
    setInput(''); setPatientInput(''); setDueDate(''); setDueTime('');
  };

  const updateStatus = async (todo: Todo) => {
    const map: Record<string, 'todo' | 'in-progress' | 'waiting' | 'done'> = { 'todo': 'in-progress', 'in-progress': 'waiting', 'waiting': 'done', 'done': 'todo' };
    const newStatus = map[todo.status || 'todo'];
    await updateDoc(doc(db, 'todos', todo.id), { status: newStatus, completed: newStatus === 'done' });
  };

  const toggleComplete = async (todo: Todo) => {
    const newCompleted = !todo.completed;
    await updateDoc(doc(db, 'todos', todo.id), { completed: newCompleted, status: newCompleted ? 'done' : 'todo' });
  };

  // --- TOAST + UNDO LOGIC ---
  const addToast = (message: string, type: ToastMsg['type'], undoAction?: () => void) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, undoAction }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const deleteTodo = async (id: string) => {
    const taskToDelete = todos.find(t => t.id === id);
    if (!taskToDelete) return;
    
    await deleteDoc(doc(db, 'todos', id));
    
    addToast("Task deleted", "info", async () => {
      // Undo logic: Restore the document
      await setDoc(doc(db, 'todos', id), taskToDelete);
      addToast("Task restored", "success");
    });
  };
  
  const openEditModal = (todo: Todo) => { setEditTask(todo); };
  
  const saveTaskChanges = async (id: string, updates: Partial<Todo>) => {
    await updateDoc(doc(db, 'todos', id), updates);
  };

  const setSmartDeadline = (type: 'today' | 'tomorrow') => {
    const targetDate = type === 'today' ? new Date() : addDays(new Date(), 1);
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    setDueDate(dateStr);
    setDueTime(getShiftEndTime(dateStr, rotas, anchorDate));
    setIsSmartDateOpen(false);
  };

  const applyEndOfDay = () => {
    const targetDate = dueDate || format(new Date(), 'yyyy-MM-dd');
    setDueTime(getShiftEndTime(targetDate, rotas, anchorDate));
    setIsTimeOpen(false);
  };

  // --- DRAG AND DROP HANDLERS ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); 
  };

  const handleDrop = async (e: React.DragEvent, newStatus: Todo['status']) => {
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
        await updateDoc(doc(db, 'todos', taskId), { 
            status: newStatus, 
            completed: newStatus === 'done' 
        });
    }
  };

  return (
    <div className="max-w-6xl mx-auto mt-6 px-4 pb-24 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} rotas={rotas} anchorDate={anchorDate} onSaveRotas={saveRotas} user={user} categories={categories} isDark={isDark} setIsDark={setIsDark} />
      <EditTaskModal isOpen={!!editTask} onClose={() => setEditTask(null)} todo={editTask} onSave={saveTaskChanges} onDelete={deleteTodo} categories={categories} rotas={rotas} anchorDate={anchorDate} />
      <CalendarManagerModal isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} outlookConnected={outlookConnected} outlookExpired={outlookExpired} googleConnected={googleConnected} onConnectOutlook={handleConnectOutlook} onConnectGoogle={handleConnectGoogle} onDisconnect={handleDisconnectCalendar} calendars={externalCalendars} toggleCalendar={toggleCalendar} />
      
      <ToastContainer toasts={toasts} />

      {/* HEADER */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">Clinical Admin <span className="text-xs bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/30">v10.0</span></h1>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mt-1 text-sm"><Clock size={14} /><span>{format(now, 'EEEE, d MMM - HH:mm')}</span></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white dark:bg-slate-800/50 rounded-lg p-1 border border-slate-200 dark:border-slate-700/50">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded transition ${viewMode==='list'?'bg-indigo-600 text-white shadow':'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}><LayoutTemplate size={18} /></button>
            <button onClick={() => setViewMode('board')} className={`p-2 rounded transition ${viewMode==='board'?'bg-indigo-600 text-white shadow':'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}><KanbanSquare size={18} /></button>
            <button onClick={() => setViewMode('calendar')} className={`p-2 rounded transition ${viewMode==='calendar'?'bg-indigo-600 text-white shadow':'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}><CalendarIcon size={18} /></button>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white transition" title="Settings"><Settings size={20} /></button>
          <div className="relative group hidden sm:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-indigo-500 w-[180px]" /></div>
          <button onClick={() => setPrivacyMode(!privacyMode)} className={`p-2 rounded-lg border transition ${privacyMode ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500 dark:text-indigo-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}>{privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}</button>
          <button onClick={handleSignOut} className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-500 hover:bg-rose-500 hover:text-white dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500 dark:hover:text-white transition ml-2" title="Sign Out"><LogOut size={20} /></button>
        </div>
      </header>

      {/* SENTENCE BUILDER UI */}
      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-8 relative z-30">
        <form onSubmit={addTodo} className="p-6 bg-white/70 dark:bg-slate-900/80 backdrop-blur-xl border border-indigo-200 dark:border-indigo-500/40 rounded-2xl shadow-xl dark:shadow-2xl text-lg md:text-xl leading-relaxed text-slate-600 dark:text-slate-300 font-light relative group transition-colors duration-300">
          
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-4">
            <span>In</span>
            <div className="relative inline-block" ref={catRef}>
              <button type="button" onClick={() => setIsCatOpen(!isCatOpen)} className="font-bold text-indigo-600 dark:text-indigo-300 border-b-2 border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-400 transition-colors cursor-pointer flex items-center gap-1">{category} <ChevronDown size={14} className="opacity-50"/></button>
              {isCatOpen && (<div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1 text-sm font-normal">{categories.map(c => <button key={c} type="button" onClick={() => { setCategory(c); setIsCatOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300">{c}</button>)}</div>)}
            </div>
            <span>, I need to</span>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="describe the task..." className="bg-transparent border-b-2 border-indigo-200 dark:border-indigo-500/30 focus:border-indigo-400 outline-none text-slate-900 dark:text-white font-medium placeholder-slate-400 dark:placeholder-indigo-500/30 min-w-[200px] flex-grow transition-all"/>
            <span>for</span>
            <div className="relative inline-flex items-center"><UserIcon size={18} className="absolute left-0 text-slate-400 dark:text-slate-500" /><input value={patientInput} onChange={(e) => setPatientInput(e.target.value)} placeholder="patient name..." className="bg-transparent border-b-2 border-indigo-200 dark:border-indigo-500/30 focus:border-indigo-400 outline-none text-slate-900 dark:text-white font-bold placeholder-slate-400 dark:placeholder-indigo-500/30 pl-6 w-[180px] transition-all"/></div>
            <span>by</span>
            {/* DATE & TIME SELECTORS */}
            {!dueDate ? (
              <div className="relative inline-block" ref={dateRef}><button type="button" onClick={() => setIsSmartDateOpen(!isSmartDateOpen)} className="font-bold text-indigo-600 dark:text-indigo-300 border-b-2 border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-400 transition-colors flex items-center gap-1 uppercase text-sm">📅 Set Deadline <ChevronDown size={14} className="opacity-50"/></button>{isSmartDateOpen && (<div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1 text-sm font-normal"><button onClick={() => setSmartDeadline('today')} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-amber-500 dark:text-amber-300 flex items-center gap-2"><Moon size={14}/> End of Today</button><button onClick={() => setSmartDeadline('tomorrow')} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-sky-500 dark:text-sky-300 flex items-center gap-2"><Sun size={14}/> End of Tomorrow</button><div className="h-[1px] bg-slate-200 dark:bg-slate-700 my-1"></div><button onClick={() => { setDueDate(format(new Date(), 'yyyy-MM-dd')); setIsSmartDateOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 flex items-center gap-2"><CalendarIcon size={14}/> Custom Date...</button></div>)}</div>
            ) : (<><div className="relative inline-block group/date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-transparent text-indigo-600 dark:text-indigo-300 font-bold border-b-2 border-indigo-200 dark:border-indigo-500/30 focus:border-indigo-400 outline-none cursor-pointer w-[130px] uppercase text-sm"/></div><div className="relative inline-block" ref={timeRef}><button type="button" onClick={() => setIsTimeOpen(!isTimeOpen)} className="font-bold text-indigo-600 dark:text-indigo-300 border-b-2 border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-400 transition-colors flex items-center gap-1 uppercase text-sm">{dueTime || "TIME"} <Clock size={14} className="opacity-50"/></button>{isTimeOpen && (<div className="absolute top-full left-0 mt-2 w-[140px] max-h-[200px] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 text-sm font-normal"><button onClick={applyEndOfDay} className="w-full text-left px-3 py-2 text-xs text-amber-500 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 flex items-center gap-2"><Moon size={12}/> End of Day</button><button onClick={() => { setDueTime(''); setIsTimeOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5">No time</button>{TIME_SLOTS.map(t => <button key={t} type="button" onClick={() => { setDueTime(t); setIsTimeOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-slate-700 dark:text-slate-300">{t}</button>)}</div>)}</div><button onClick={() => { setDueDate(''); setDueTime(''); }} className="ml-2 p-1 text-slate-400 hover:text-rose-500 transition"><X size={14}/></button></>)}
            <span>with</span>
            {/* PRIORITY SELECTOR */}
            <div className="relative inline-block" ref={prioRef}><button type="button" onClick={() => setIsPriorityOpen(!isPriorityOpen)} className={`font-bold border-b-2 border-dashed transition-colors flex items-center gap-1 ${priority === 'high' ? 'text-rose-500 dark:text-rose-400 border-rose-500/50' : priority === 'medium' ? 'text-amber-500 dark:text-amber-400 border-amber-500/50' : 'text-slate-500 dark:text-slate-400 border-slate-400 dark:border-slate-600'}`}>{priority.toUpperCase()} <Flag size={14} fill={priority === 'high' ? "currentColor" : "none"}/></button>{isPriorityOpen && (<div className="absolute top-full left-0 mt-2 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1 text-sm font-normal">{['low', 'medium', 'high'].map(p => (<button key={p} type="button" onClick={()=>{setPriority(p as any); setIsPriorityOpen(false)}} className={`w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 capitalize ${p==='high'?'text-rose-500':p==='medium'?'text-amber-500':'text-slate-500'}`}>{p}</button>))}</div>)}</div>
            <span>priority.</span>
          </div>
          <button type="submit" className="absolute bottom-6 right-6 bg-indigo-600 hover:bg-indigo-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-transform active:scale-90 group-hover:scale-110"><Plus size={24} /></button>
        </form>
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide px-2"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider py-1.5 mr-2 flex items-center gap-1"><Tag size={12}/> Quick Add:</span>{QUICK_TEMPLATES.map(tmpl => (<button key={tmpl} onClick={() => setInput(tmpl + ' ')} className="text-xs font-medium bg-white dark:bg-slate-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition whitespace-nowrap">{tmpl}</button>))}</div>
      </motion.div>

      {/* --- VIEWS --- */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {isLoading && <div className="text-center text-slate-500 py-10">Loading...</div>}
          {groupedTodos.list.overdue.length > 0 && (
            <div className="space-y-2">
              <button onClick={() => toggleSection('overdue')} className="flex items-center gap-2 text-rose-500 dark:text-rose-400 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.overdue ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Overdue ({groupedTodos.list.overdue.length})</button>
              <AnimatePresence>{sections.overdue && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.overdue.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}</motion.div>}</AnimatePresence>
            </div>
          )}
          <div className="space-y-2">
            <button onClick={() => toggleSection('soon')} className="flex items-center gap-2 text-amber-500 dark:text-amber-400 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.soon ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Due Soon ({groupedTodos.list.soon.length})</button>
            <AnimatePresence>{sections.soon && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.soon.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}</motion.div>}</AnimatePresence>
          </div>
          <div className="space-y-2">
            <button onClick={() => toggleSection('later')} className="flex items-center gap-2 text-indigo-500 dark:text-indigo-300 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.later ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Later ({groupedTodos.list.later.length})</button>
            <AnimatePresence>{sections.later && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.later.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}</motion.div>}</AnimatePresence>
          </div>
          {groupedTodos.list.completed.length > 0 && (
            <div className="space-y-2 pt-6 border-t border-slate-200 dark:border-white/5">
              <button onClick={() => toggleSection('completed')} className="flex items-center gap-2 text-slate-500 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.completed ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Completed ({groupedTodos.list.completed.length})</button>
              <AnimatePresence>{sections.completed && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.completed.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}</motion.div>}</AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* --- BOARD VIEW WITH DRAG & DROP --- */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
           {/* TODO COLUMN */}
           <div 
             className="space-y-3 min-h-[200px]" 
             onDragOver={handleDragOver} 
             onDrop={(e) => handleDrop(e, 'todo')}
           >
             <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Circle size={14} /> To Do ({groupedTodos.board.todo.length})</h3>
             {groupedTodos.board.todo.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}
           </div>

           {/* IN PROGRESS */}
           <div 
             className="space-y-3 min-h-[200px]" 
             onDragOver={handleDragOver} 
             onDrop={(e) => handleDrop(e, 'in-progress')}
           >
             <h3 className="text-sm font-bold text-sky-500 uppercase tracking-wider flex items-center gap-2"><Activity size={14} /> In Progress ({groupedTodos.board.inProgress.length})</h3>
             {groupedTodos.board.inProgress.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}
           </div>

           {/* WAITING */}
           <div 
             className="space-y-3 min-h-[200px]" 
             onDragOver={handleDragOver} 
             onDrop={(e) => handleDrop(e, 'waiting')}
           >
             <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2"><Hourglass size={14} /> Waiting ({groupedTodos.board.waiting.length})</h3>
             {groupedTodos.board.waiting.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}
           </div>

           {/* DONE */}
           <div 
             className="space-y-3 min-h-[200px]" 
             onDragOver={handleDragOver} 
             onDrop={(e) => handleDrop(e, 'done')}
           >
             <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2"><CheckCircle2 size={14} /> Done ({groupedTodos.board.done.length})</h3>
             <div className="opacity-70">
                {groupedTodos.board.done.map(t => <TaskItem key={t.id} todo={t} now={now} onEdit={openEditModal} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} updateStatus={updateStatus} />)}
             </div>
           </div>
        </div>
      )}

      {viewMode === 'calendar' && (
        <CalendarView todos={todos} currentDate={calendarDate} setCurrentDate={setCalendarDate} onEdit={openEditModal} googleEvents={googleEvents} outlookEvents={outlookEvents} visibleCalendars={visibleCalendars} setVisibleCalendars={setVisibleCalendars} setIsManagerOpen={setIsManagerOpen} />
      )}

      {/* FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-2 z-50 transition-all duration-300">
         <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <div className="flex gap-4 min-w-fit"><span className="flex items-center gap-1"><LayoutTemplate size={14}/> Total: <strong className="text-slate-800 dark:text-white">{stats.total}</strong></span><span className="flex items-center gap-1 text-rose-500 dark:text-rose-400"><Flag size={14}/> Urgent: <strong className="text-rose-600 dark:text-rose-300">{stats.urgent}</strong></span><span className="flex items-center gap-1 text-amber-500 dark:text-amber-400"><Hourglass size={14}/> Waiting: <strong className="text-amber-600 dark:text-amber-300">{stats.waiting}</strong></span></div>
            <div className="flex-1 flex gap-3 overflow-x-auto scrollbar-hide px-4 mask-fade-sides justify-center max-w-full">{Object.entries(categoryStats).map(([cat, count]) => (<span key={cat} className="flex items-center gap-1 whitespace-nowrap text-slate-600 dark:text-slate-500 text-[10px] sm:text-xs"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> {cat}: <strong className="text-slate-800 dark:text-slate-300">{count}</strong></span>))}</div>
            <div className="flex flex-col items-end gap-0.5 min-w-fit text-right"><div className="flex items-center gap-1 text-emerald-500"><CheckCircle2 size={14} /> Done Today: <strong className="text-emerald-600 dark:text-emerald-400">{stats.completedToday}</strong></div><div className="text-[9px] text-slate-400 dark:text-slate-600 font-medium">Created by Yaseen Hussain &copy; 2026</div></div>
         </div>
      </div>
    </div>
  );
}