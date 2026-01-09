import { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { signOut, updatePassword } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Plus, Calendar, Clock, Pencil, X, Check, Eye, EyeOff, Search, User as UserIcon, Target, ChevronDown, ChevronRight, Hourglass, AlertTriangle, LayoutTemplate, KanbanSquare, Flag, Activity, Settings, Save, Moon, RefreshCw, LogOut, Lock, ShieldCheck, Tag, Zap, Sun } from 'lucide-react';
import { format, isPast, parseISO, intervalToDuration, addHours, isBefore, differenceInCalendarWeeks, startOfWeek, subWeeks, addDays } from 'date-fns';

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
  createdAt: any; 
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

// 🔄 SMART ROTA LOGIC
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
  if (isPast(due)) return { text: 'Overdue', color: 'text-rose-400 font-bold' };
  const duration = intervalToDuration({ start: now, end: due });
  const parts = [];
  if (duration.days) parts.push(`${duration.days}d`);
  if (duration.hours) parts.push(`${duration.hours}h`);
  const text = parts.slice(0, 2).join(' ') + ' left'; 
  let color = 'text-indigo-300';
  if (!duration.months && !duration.days && duration.hours && duration.hours < 4) color = 'text-amber-400 font-bold';
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

// --- SETTINGS MODAL ---
const SettingsModal = ({ isOpen, onClose, rotas, onSaveRotas, anchorDate, user }: any) => {
  const [activeTab, setActiveTab] = useState<'rota' | 'account'>('rota');
  const [localRotas, setLocalRotas] = useState<RotaSystem>(rotas);
  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [currentWeekSelection, setCurrentWeekSelection] = useState(0);
  
  // Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (rotas) setLocalRotas(rotas);
    if (anchorDate && rotas.length > 0) {
        const anchor = parseISO(anchorDate);
        const weeksPassed = differenceInCalendarWeeks(new Date(), anchor, { weekStartsOn: 1 });
        const currentIndex = ((weeksPassed % rotas.length) + rotas.length) % rotas.length;
        setCurrentWeekSelection(currentIndex);
    }
  }, [rotas, anchorDate]);

  if (!isOpen) return null;

  const handleRotaChange = (day: string, field: keyof DaySchedule, value: any) => {
    const updatedRotas = [...localRotas];
    updatedRotas[activeWeekIndex] = {
      ...updatedRotas[activeWeekIndex],
      [day]: { ...updatedRotas[activeWeekIndex][day], [field]: value }
    };
    setLocalRotas(updatedRotas);
  };
  const addWeek = () => { setLocalRotas([...localRotas, JSON.parse(JSON.stringify(DEFAULT_WEEK))]); setActiveWeekIndex(localRotas.length); };
  const removeWeek = (index: number) => { if(localRotas.length<=1)return; setLocalRotas(localRotas.filter((_,i)=>i!==index)); setActiveWeekIndex(0); };
  const handleSaveRota = () => {
    const today = new Date();
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });
    const newAnchorDate = subWeeks(startOfCurrentWeek, currentWeekSelection);
    const newAnchorStr = format(newAnchorDate, 'yyyy-MM-dd');
    onSaveRotas(localRotas, newAnchorStr);
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 8) { setPasswordMsg({ text: 'Password too short', type: 'error' }); return; }
    if (newPassword !== confirmPassword) { setPasswordMsg({ text: 'Passwords do not match', type: 'error' }); return; }
    try {
      if (user) {
        await updatePassword(user, newPassword);
        setPasswordMsg({ text: 'Password updated!', type: 'success' });
        setNewPassword(''); setConfirmPassword('');
      }
    } catch (err: any) { setPasswordMsg({ text: err.message, type: 'error' }); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 sticky top-0 z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings size={20} /> Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20}/></button>
        </div>
        <div className="flex border-b border-slate-800">
          <button onClick={() => setActiveTab('rota')} className={`flex-1 py-3 text-sm font-medium transition ${activeTab === 'rota' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200'}`}>Work Schedule</button>
          <button onClick={() => setActiveTab('account')} className={`flex-1 py-3 text-sm font-medium transition ${activeTab === 'account' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200'}`}>Account</button>
        </div>
        {activeTab === 'rota' && (
          <>
            <div className="bg-indigo-500/10 border-b border-indigo-500/20 p-4">
                <div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-indigo-200 flex items-center gap-2"><RefreshCw size={14}/> Sync Current Week</span><span className="text-xs text-indigo-300/60">{format(new Date(), 'd MMM')}</span></div>
                <div className="flex items-center gap-3"><span className="text-sm text-slate-300">This week is:</span><div className="relative flex-1"><select value={currentWeekSelection} onChange={(e) => setCurrentWeekSelection(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 appearance-none cursor-pointer focus:border-indigo-500 focus:outline-none">{localRotas.map((_, idx) => (<option key={idx} value={idx}>Week {idx + 1}</option>))}</select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
            </div>
            <div className="flex items-center gap-2 px-6 pt-4 pb-2 overflow-x-auto scrollbar-hide">
              {localRotas.map((_, idx) => (
                <div key={idx} className="flex items-center"><button onClick={() => setActiveWeekIndex(idx)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${activeWeekIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Week {idx + 1}</button>{localRotas.length > 1 && activeWeekIndex === idx && <button onClick={() => removeWeek(idx)} className="ml-1 p-1 text-rose-400 hover:bg-rose-500/10 rounded-full"><X size={12} /></button>}</div>
              ))}
              <button onClick={addWeek} className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500 transition"><Plus size={14} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                const dayData = (localRotas[activeWeekIndex] || DEFAULT_WEEK)[day] || DEFAULT_WEEK.monday;
                return (
                  <div key={day} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div className="w-24 capitalize text-sm font-medium text-slate-200">{day}</div>
                    {!dayData.isOff ? (<><input type="time" value={dayData.start} onChange={(e) => handleRotaChange(day, 'start', e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white" /><span className="text-slate-500">-</span><input type="time" value={dayData.end} onChange={(e) => handleRotaChange(day, 'end', e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white" /></>) : <span className="flex-1 text-center text-xs text-slate-500 uppercase tracking-wider font-bold">Day Off</span>}
                    <button onClick={() => handleRotaChange(day, 'isOff', !dayData.isOff)} className={`px-3 py-1 rounded text-xs font-bold transition ${dayData.isOff ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700 text-slate-400'}`}>{dayData.isOff ? 'OFF' : 'ON'}</button>
                  </div>
                );
              })}
            </div>
            <div className="p-4 bg-slate-800/50 border-t border-slate-800 flex justify-end gap-3 sticky bottom-0">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleSaveRota} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Save size={16} /> Save Rota</button>
            </div>
          </>
        )}
        {activeTab === 'account' && (
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
             <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-white font-bold flex items-center gap-2 mb-4"><Lock size={18} className="text-indigo-400"/> Change Password</h3>
                <div className="space-y-4">
                   <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="New Password" />
                   <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Confirm Password" />
                   {passwordMsg.text && <div className={`text-xs p-2 rounded ${passwordMsg.type === 'error' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{passwordMsg.text}</div>}
                   <button onClick={handleUpdatePassword} className="w-full py-2 bg-slate-700 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition">Update</button>
                </div>
             </div>
             <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30"><h3 className="text-slate-300 font-bold flex items-center gap-2 mb-2"><ShieldCheck size={18}/> Data Privacy</h3><p className="text-xs text-slate-500 leading-relaxed">Your data is stored securely in compliance with UK GDPR standards.</p></div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// --- TASK ITEM COMPONENT ---
const TaskItem = ({ 
  todo, now, editingId, editForm, setEditForm, saveEdit, startEditing, deleteTodo, toggleComplete, privacyMode, setEditingId, updateStatus, rotas, anchorDate
}: any) => {
  const [isEditTimeOpen, setIsEditTimeOpen] = useState(false);
  const remaining = getTimeRemaining(todo.dueDate, todo.dueTime, now);
  const waiting = getTimeWaiting(todo.createdAt, now);
  const createdStr = todo.createdAt?.seconds ? format(new Date(todo.createdAt.seconds * 1000), 'd MMM') : 'Now';
  const currentStatus = todo.status || 'todo'; 
  const currentPriority = todo.priority || 'medium';

  const applyEndOfDay = () => {
    const targetDate = editForm.dueDate || todo.dueDate || format(new Date(), 'yyyy-MM-dd');
    const shiftEnd = getShiftEndTime(targetDate, rotas, anchorDate);
    setEditForm({ ...editForm, dueTime: shiftEnd });
    setIsEditTimeOpen(false);
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className={`glass-panel p-3 flex flex-col sm:flex-row sm:items-start justify-between group border-l-4 mb-3 ${todo.completed ? 'border-l-slate-600 opacity-60 bg-slate-900/40' : currentPriority === 'high' ? 'border-l-rose-500 shadow-rose-500/10' : 'border-l-indigo-500'}`}>
      <div className="flex items-start gap-3 w-full">
        {editingId !== todo.id && (
          <button onClick={() => toggleComplete(todo)} className="text-slate-500 hover:text-indigo-400 transition mt-1">
            {todo.completed ? <CheckCircle2 className="text-emerald-500/80" size={22} /> : <Circle size={22} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          {editingId === todo.id ? (
            <div className="flex flex-col gap-2 w-full pr-12">
                <div className="flex gap-2 relative">
                  <input value={editForm.patientName} onChange={(e) => setEditForm({ ...editForm, patientName: e.target.value })} className="w-1/3 bg-slate-800/50 text-indigo-300 font-bold text-sm p-2 rounded border border-indigo-500/30 focus:outline-none" placeholder="Patient Name" />
                  <input type="date" value={editForm.dueDate || ''} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} className="bg-slate-800/50 text-slate-300 text-sm p-2 rounded border border-indigo-500/30 w-[110px]" />
                  <div className="relative">
                    <button onClick={() => setIsEditTimeOpen(!isEditTimeOpen)} className="flex items-center gap-1 bg-slate-800/50 text-slate-300 text-sm p-2 rounded border border-indigo-500/30 w-[80px] justify-center">{editForm.dueTime || <Clock size={14}/>}</button>
                    {isEditTimeOpen && (
                      <div className="absolute top-full left-0 mt-1 w-[140px] max-h-[150px] overflow-y-auto bg-slate-800 border border-slate-700 rounded z-50">
                         <button onClick={applyEndOfDay} className="w-full text-left px-3 py-2 text-xs text-amber-300 hover:bg-white/5 border-b border-white/5 flex items-center gap-2"><Moon size={12}/> End of Day</button>
                         <button onClick={() => { setEditForm({...editForm, dueTime: ''}); setIsEditTimeOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-white/5 border-b border-white/5">No time</button>
                         {TIME_SLOTS.map(t => <button key={t} onClick={()=>{setEditForm({...editForm, dueTime:t}); setIsEditTimeOpen(false)}} className="w-full text-left px-2 py-1 text-xs hover:bg-white/10 text-slate-300">{t}</button>)}
                      </div>
                    )}
                  </div>
                </div>
                <input value={editForm.text} onChange={(e) => setEditForm({ ...editForm, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit(todo.id)} className="w-full bg-slate-800/50 text-white p-2 rounded border border-indigo-500/50 focus:outline-none" autoFocus />
            </div>
          ) : (
            <div className={`${privacyMode ? 'blur-md hover:blur-none select-none duration-500' : ''}`}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {currentPriority === 'high' && <span className="animate-pulse text-rose-500"><AlertTriangle size={14} /></span>}
                {todo.patientName && <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-sm"><UserIcon size={12} /> {todo.patientName}</div>}
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-white/5 px-2 py-0.5 rounded">{todo.category}</span>
                <button onClick={() => updateStatus(todo)} className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ml-auto sm:ml-0 transition ${currentStatus === 'in-progress' ? 'border-sky-500/30 text-sky-400 bg-sky-500/10' : currentStatus === 'waiting' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' : currentStatus === 'done' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-slate-700 text-slate-500'}`}>{currentStatus.replace('-', ' ')}</button>
              </div>
              <p className={`text-base transition-all ${todo.completed ? 'line-through decoration-slate-600 text-slate-500' : 'text-slate-200'}`}>{todo.text}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500 border-t border-white/5 pt-2 w-full">
                <span className="text-slate-500 flex items-center gap-1" title="Created"><Clock size={10} /> {createdStr}</span>
                <span className="text-slate-400 flex items-center gap-1" title="Time Waiting"><Hourglass size={10} /> {waiting}</span>
                {remaining && !todo.completed && <span className={`font-medium flex items-center gap-1 ${remaining.color}`}><Target size={10}/> {remaining.text}</span>}
                {todo.dueDate && <span className="text-slate-300 flex items-center gap-1"><Calendar size={10} /> {format(parseISO(todo.dueDate), 'd MMM')} {todo.dueTime}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 absolute top-3 right-3 sm:static sm:ml-4 self-start">
        {editingId === todo.id ? (
          <>
            <button onClick={() => saveEdit(todo.id)} className="text-emerald-400 hover:bg-emerald-400/10 p-1.5 rounded transition"><Check size={16} /></button>
            <button onClick={() => setEditingId(null)} className="text-rose-400 hover:bg-rose-400/10 p-1.5 rounded transition"><X size={16} /></button>
          </>
        ) : (
          <>
            <button onClick={() => startEditing(todo)} className="text-slate-500 hover:text-indigo-400 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 hover:bg-white/5 rounded"><Pencil size={16} /></button>
            <button onClick={() => deleteTodo(todo.id)} className="text-slate-500 hover:text-rose-400 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 hover:bg-white/5 rounded"><Trash2 size={16} /></button>
          </>
        )}
      </div>
    </motion.div>
  );
};

// --- MAIN DASHBOARD ---
export default function Dashboard({ user }: DashboardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list'); 
  const [rotas, setRotas] = useState<RotaSystem>([DEFAULT_WEEK]); 
  const [anchorDate, setAnchorDate] = useState<string>(''); 
  
  // Input State
  const [input, setInput] = useState('');
  const [patientInput, setPatientInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [category, setCategory] = useState('General');
  const [priority, setPriority] = useState<'low'|'medium'|'high'>('medium');
  const [categories, setCategories] = useState<string[]>(['General']);
  const [isLoading, setIsLoading] = useState(true);

  // UI State
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [isSmartDateOpen, setIsSmartDateOpen] = useState(false);
  const [isTimeOpen, setIsTimeOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // General State
  const [now, setNow] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ text: '', patientName: '', dueTime: '', dueDate: '' });
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
        if (data.categories) setCategories(data.categories);
        if (data.rotas) setRotas(data.rotas); 
        else if (data.schedule) setRotas([data.schedule]);
        if (data.anchorDate) setAnchorDate(data.anchorDate);
      }
    });
    
    return () => { clearInterval(timer); unsub(); };
  }, [user]);

  // --- STATS ---
  const stats = useMemo(() => {
    return {
      total: todos.length,
      urgent: todos.filter(t => t.priority === 'high' && !t.completed).length,
      waiting: todos.filter(t => t.status === 'waiting' && !t.completed).length,
      completedToday: todos.filter(t => t.completed).length 
    };
  }, [todos]);

  // --- GROUPING ---
  const groupedTodos = useMemo(() => {
    const filtered = todos.filter(t => 
      t.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.patientName && t.patientName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

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

  const deleteTodo = async (id: string) => deleteDoc(doc(db, 'todos', id));
  
  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditForm({ text: todo.text, patientName: todo.patientName || '', dueTime: todo.dueTime || '', dueDate: todo.dueDate || '' });
  };
  
  const saveEdit = async (id: string) => {
    if (!editForm.text.trim()) return;
    await updateDoc(doc(db, 'todos', id), { 
      text: editForm.text, patientName: editForm.patientName, dueTime: editForm.dueTime, dueDate: editForm.dueDate 
    });
    setEditingId(null);
  };

  const setSmartDeadline = (type: 'today' | 'tomorrow') => {
    const targetDate = type === 'today' ? new Date() : addDays(new Date(), 1);
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    setDueDate(dateStr);
    setDueTime(getShiftEndTime(dateStr, rotas, anchorDate));
    setIsSmartDateOpen(false);
  };

  return (
    <div className="max-w-6xl mx-auto mt-6 px-4 pb-24">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} rotas={rotas} anchorDate={anchorDate} onSaveRotas={saveRotas} user={user} />

      {/* HEADER */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">Clinical Admin <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">v6.0</span></h1>
          <div className="flex items-center gap-2 text-slate-400 mt-1 text-sm">
            <Clock size={14} /><span>{format(now, 'EEEE, d MMM - HH:mm')}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded transition ${viewMode==='list'?'bg-indigo-600 text-white shadow':'text-slate-400 hover:text-white'}`}><LayoutTemplate size={18} /></button>
            <button onClick={() => setViewMode('board')} className={`p-2 rounded transition ${viewMode==='board'?'bg-indigo-600 text-white shadow':'text-slate-400 hover:text-white'}`}><KanbanSquare size={18} /></button>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition" title="Settings"><Settings size={20} /></button>
          <div className="relative group hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="bg-slate-800/50 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-indigo-500 w-[180px]" />
          </div>
          <button onClick={() => setPrivacyMode(!privacyMode)} className={`p-2 rounded-lg border transition ${privacyMode ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>{privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}</button>
          <button onClick={handleSignOut} className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white transition ml-2" title="Sign Out"><LogOut size={20} /></button>
        </div>
      </header>

      {/* SENTENCE BUILDER UI */}
      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-8 relative z-30">
        <form onSubmit={addTodo} className="p-6 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 backdrop-blur-xl border border-indigo-500/40 rounded-2xl shadow-2xl ring-1 ring-indigo-500/20 text-lg md:text-xl leading-relaxed text-slate-300 font-light relative group">
          
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-4">
            <span>In</span>
            
            {/* CATEGORY */}
            <div className="relative inline-block" ref={catRef}>
              <button type="button" onClick={() => setIsCatOpen(!isCatOpen)} className="font-bold text-indigo-300 border-b-2 border-indigo-500/30 hover:border-indigo-400 transition-colors cursor-pointer flex items-center gap-1">
                {category} <ChevronDown size={14} className="opacity-50"/>
              </button>
              {isCatOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 py-1 text-sm font-normal">
                  {categories.map(c => <button key={c} type="button" onClick={() => { setCategory(c); setIsCatOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-white/5 text-slate-300">{c}</button>)}
                </div>
              )}
            </div>

            <span>, I need to</span>

            <input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="describe the task..." 
              className="bg-transparent border-b-2 border-indigo-500/30 focus:border-indigo-400 outline-none text-white font-medium placeholder-indigo-500/30 min-w-[200px] flex-grow transition-all"
            />

            <span>for</span>

            <div className="relative inline-flex items-center">
              <UserIcon size={18} className="absolute left-0 text-slate-500" />
              <input 
                value={patientInput} 
                onChange={(e) => setPatientInput(e.target.value)} 
                placeholder="patient name..." 
                className="bg-transparent border-b-2 border-indigo-500/30 focus:border-indigo-400 outline-none text-white font-bold placeholder-indigo-500/30 pl-6 w-[180px] transition-all"
              />
            </div>

            <span>by</span>

            {/* SMART DATE SELECTOR */}
            {!dueDate ? (
              <div className="relative inline-block" ref={dateRef}>
                <button type="button" onClick={() => setIsSmartDateOpen(!isSmartDateOpen)} className="font-bold text-indigo-300 border-b-2 border-indigo-500/30 hover:border-indigo-400 transition-colors flex items-center gap-1 uppercase text-sm">
                  📅 Set Deadline <ChevronDown size={14} className="opacity-50"/>
                </button>
                {isSmartDateOpen && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 py-1 text-sm font-normal">
                    <button onClick={() => setSmartDeadline('today')} className="w-full text-left px-4 py-2 hover:bg-white/5 text-amber-300 flex items-center gap-2"><Moon size={14}/> End of Today</button>
                    <button onClick={() => setSmartDeadline('tomorrow')} className="w-full text-left px-4 py-2 hover:bg-white/5 text-sky-300 flex items-center gap-2"><Sun size={14}/> End of Tomorrow</button>
                    <div className="h-[1px] bg-slate-700 my-1"></div>
                    <button onClick={() => { setDueDate(format(new Date(), 'yyyy-MM-dd')); setIsSmartDateOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-white/5 text-slate-300 flex items-center gap-2"><Calendar size={14}/> Custom Date...</button>
                  </div>
                )}
              </div>
            ) : (
              // IF DATE IS SET -> SHOW MANUAL INPUTS
              <>
                <div className="relative inline-block group/date">
                   <input 
                     type="date" 
                     value={dueDate} 
                     onChange={(e) => setDueDate(e.target.value)} 
                     className="bg-transparent text-indigo-300 font-bold border-b-2 border-indigo-500/30 focus:border-indigo-400 outline-none cursor-pointer w-[130px] uppercase text-sm"
                   />
                </div>
                <div className="relative inline-block" ref={timeRef}>
                   <button type="button" onClick={() => setIsTimeOpen(!isTimeOpen)} className="font-bold text-indigo-300 border-b-2 border-indigo-500/30 hover:border-indigo-400 transition-colors flex items-center gap-1 uppercase text-sm">
                     {dueTime || "TIME"} <Clock size={14} className="opacity-50"/>
                   </button>
                   {isTimeOpen && (
                     <div className="absolute top-full left-0 mt-2 w-[140px] max-h-[200px] overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 text-sm font-normal">
                       <button onClick={() => { setDueTime(''); setIsTimeOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-white/5 border-b border-white/5">No time</button>
                       {TIME_SLOTS.map(t => <button key={t} type="button" onClick={() => { setDueTime(t); setIsTimeOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-indigo-500/20 text-slate-300">{t}</button>)}
                     </div>
                   )}
                </div>
                <button onClick={() => { setDueDate(''); setDueTime(''); }} className="ml-2 p-1 text-slate-500 hover:text-rose-400 transition"><X size={14}/></button>
              </>
            )}

            <span>with</span>

            {/* PRIORITY */}
            <div className="relative inline-block" ref={prioRef}>
               <button type="button" onClick={() => setIsPriorityOpen(!isPriorityOpen)} className={`font-bold border-b-2 border-dashed transition-colors flex items-center gap-1 ${priority === 'high' ? 'text-rose-400 border-rose-500/50' : priority === 'medium' ? 'text-amber-400 border-amber-500/50' : 'text-slate-400 border-slate-600'}`}>
                 {priority.toUpperCase()} <Flag size={14} fill={priority === 'high' ? "currentColor" : "none"}/>
               </button>
               {isPriorityOpen && (
                 <div className="absolute top-full left-0 mt-2 w-32 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 py-1 text-sm font-normal">
                   {['low', 'medium', 'high'].map(p => (
                     <button key={p} type="button" onClick={()=>{setPriority(p as any); setIsPriorityOpen(false)}} className={`w-full text-left px-4 py-2 hover:bg-white/5 capitalize ${p==='high'?'text-rose-400':p==='medium'?'text-amber-400':'text-slate-400'}`}>{p}</button>
                   ))}
                 </div>
               )}
            </div>

            <span>priority.</span>
          </div>

          <button type="submit" className="absolute bottom-6 right-6 bg-indigo-600 hover:bg-indigo-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-transform active:scale-90 group-hover:scale-110">
            <Plus size={24} />
          </button>
        </form>

        {/* QUICK TEMPLATES */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide px-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider py-1.5 mr-2 flex items-center gap-1"><Tag size={12}/> Quick Add:</span>
          {QUICK_TEMPLATES.map(tmpl => (
            <button key={tmpl} onClick={() => setInput(tmpl + ' ')} className="text-xs font-medium bg-slate-800/50 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:border-indigo-500/30 transition whitespace-nowrap">
              {tmpl}
            </button>
          ))}
        </div>
      </motion.div>

      {/* VIEWS & CONTENT */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {isLoading && <div className="text-center text-slate-500 py-10">Loading...</div>}
          {groupedTodos.list.overdue.length > 0 && (
            <div className="space-y-2">
              <button onClick={() => toggleSection('overdue')} className="flex items-center gap-2 text-rose-400 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.overdue ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Overdue ({groupedTodos.list.overdue.length})</button>
              <AnimatePresence>{sections.overdue && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.overdue.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</motion.div>}</AnimatePresence>
            </div>
          )}
          <div className="space-y-2">
            <button onClick={() => toggleSection('soon')} className="flex items-center gap-2 text-amber-400 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.soon ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Due Soon ({groupedTodos.list.soon.length})</button>
            <AnimatePresence>{sections.soon && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.soon.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</motion.div>}</AnimatePresence>
          </div>
          <div className="space-y-2">
            <button onClick={() => toggleSection('later')} className="flex items-center gap-2 text-indigo-300 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.later ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Later ({groupedTodos.list.later.length})</button>
            <AnimatePresence>{sections.later && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.later.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</motion.div>}</AnimatePresence>
          </div>
          {groupedTodos.list.completed.length > 0 && (
            <div className="space-y-2 pt-6 border-t border-white/5">
              <button onClick={() => toggleSection('completed')} className="flex items-center gap-2 text-slate-500 font-bold uppercase text-xs w-full hover:bg-white/5 p-2 rounded transition">{sections.completed ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Completed ({groupedTodos.list.completed.length})</button>
              <AnimatePresence>{sections.completed && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">{groupedTodos.list.completed.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</motion.div>}</AnimatePresence>
            </div>
          )}
        </div>
      )}

      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
           <div className="space-y-3"><h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Circle size={14} /> To Do ({groupedTodos.board.todo.length})</h3><div className="space-y-2 min-h-[200px]">{groupedTodos.board.todo.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</div></div>
           <div className="space-y-3"><h3 className="text-sm font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2"><Activity size={14} /> In Progress ({groupedTodos.board.inProgress.length})</h3><div className="space-y-2 min-h-[200px]">{groupedTodos.board.inProgress.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</div></div>
           <div className="space-y-3"><h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2"><Hourglass size={14} /> Waiting ({groupedTodos.board.waiting.length})</h3><div className="space-y-2 min-h-[200px]">{groupedTodos.board.waiting.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</div></div>
           <div className="space-y-3"><h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2"><CheckCircle2 size={14} /> Done ({groupedTodos.board.done.length})</h3><div className="space-y-2 min-h-[200px] opacity-70">{groupedTodos.board.done.map(t => <TaskItem key={t.id} todo={t} now={now} editingId={editingId} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} startEditing={startEditing} deleteTodo={deleteTodo} toggleComplete={toggleComplete} privacyMode={privacyMode} setEditingId={setEditingId} updateStatus={updateStatus} rotas={rotas} anchorDate={anchorDate} />)}</div></div>
        </div>
      )}

      {/* FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md border-t border-slate-800 p-3 z-50">
         <div className="max-w-6xl mx-auto flex items-center justify-between text-xs sm:text-sm text-slate-400">
            <div className="flex gap-4">
              <span className="flex items-center gap-1"><LayoutTemplate size={14}/> Total: <strong className="text-white">{stats.total}</strong></span>
              <span className="flex items-center gap-1 text-rose-400"><Flag size={14}/> Urgent: <strong className="text-rose-300">{stats.urgent}</strong></span>
              <span className="flex items-center gap-1 text-amber-400"><Hourglass size={14}/> Waiting: <strong className="text-amber-300">{stats.waiting}</strong></span>
            </div>
            <div className="flex items-center gap-1 text-emerald-500">
               <CheckCircle2 size={14} /> Completed Today: <strong className="text-emerald-400">{stats.completedToday}</strong>
            </div>
         </div>
      </div>
    </div>
  );
}