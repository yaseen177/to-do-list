import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Plus, Calendar, Clock, Pencil, X, Check, Eye, EyeOff, Search, User as UserIcon, Target, ChevronDown, ChevronRight, Hourglass, AlertTriangle } from 'lucide-react';
import { format, isPast, parseISO, intervalToDuration, addHours, isBefore } from 'date-fns';

interface Todo {
  id: string;
  text: string;
  patientName: string;
  completed: boolean;
  uid: string;
  category: string;
  dueDate: string;
  dueTime: string;
  createdAt: any; 
}

interface DashboardProps {
  user: User;
}

const QUICK_TEMPLATES = ["Referral:", "GOS18:", "Notes:", "Order:", "Phone:"];

// 🕒 Generate 30-minute slots from 08:00 to 19:00
const TIME_SLOTS = Array.from({ length: 23 }).map((_, i) => {
  const totalMinutes = (8 * 60) + (i * 30); // Start at 8:00 AM
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
});

export default function Dashboard({ user }: DashboardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  
  // Input State
  const [input, setInput] = useState('');
  const [patientInput, setPatientInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [category, setCategory] = useState('General');
  const [categories, setCategories] = useState<string[]>(['General']);
  const [isLoading, setIsLoading] = useState(true);

  // Dropdown UI State
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [isTimeOpen, setIsTimeOpen] = useState(false); // New Time Dropdown State

  // Time & UI State
  const [now, setNow] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ text: '', patientName: '', dueTime: '' });
  const [isEditTimeOpen, setIsEditTimeOpen] = useState(false); // Edit Mode Time Dropdown
  
  const [privacyMode, setPrivacyMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sections State
  const [sections, setSections] = useState({
    overdue: true,
    soon: true,
    later: true,
    completed: false 
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Click Outside Handlers
  const timeDropdownRef = useRef<HTMLDivElement>(null);
  const catDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(event.target as Node)) {
        setIsTimeOpen(false);
      }
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target as Node)) {
        setIsCatOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubCat = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists() && docSnap.data().categories) {
        setCategories(docSnap.data().categories);
      }
    });

    const q = query(collection(db, 'todos'), where('uid', '==', user.uid));
    const unsubTodos = onSnapshot(q, (snapshot) => {
      let tasks = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Todo));
      tasks.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTodos(tasks);
      setIsLoading(false);
    });

    return () => { unsubCat(); unsubTodos(); };
  }, [user]);

  // --- GROUPING LOGIC ---
  const groupedTodos = useMemo(() => {
    const filtered = todos.filter(todo => 
      todo.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (todo.patientName && todo.patientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      todo.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groups = {
      overdue: [] as Todo[],
      soon: [] as Todo[],
      later: [] as Todo[],
      completed: [] as Todo[]
    };

    const next24h = addHours(now, 24);

    filtered.forEach(todo => {
      if (todo.completed) {
        groups.completed.push(todo);
        return;
      }

      if (!todo.dueDate) {
        groups.later.push(todo);
        return;
      }

      const due = parseISO(todo.dueDate);
      if (todo.dueTime) {
        const [h, m] = todo.dueTime.split(':').map(Number);
        due.setHours(h, m, 0);
      } else {
        due.setHours(23, 59, 59);
      }

      if (isBefore(due, now)) {
        groups.overdue.push(todo);
      } else if (isBefore(due, next24h)) {
        groups.soon.push(todo);
      } else {
        groups.later.push(todo);
      }
    });

    return groups;
  }, [todos, searchQuery, now]);

  // --- ACTIONS ---
  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !patientInput.trim()) return;
    await addDoc(collection(db, 'todos'), {
      text: input, patientName: patientInput, completed: false, uid: user.uid, category, dueDate, dueTime, createdAt: serverTimestamp()
    });
    setInput(''); setPatientInput(''); setDueDate(''); setDueTime('');
  };

  const toggleComplete = async (todo: Todo) => {
    await updateDoc(doc(db, 'todos', todo.id), { completed: !todo.completed });
  };

  const deleteTodo = async (id: string) => {
    await deleteDoc(doc(db, 'todos', id));
  };

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditForm({ text: todo.text, patientName: todo.patientName || '', dueTime: todo.dueTime || '' });
    setIsEditTimeOpen(false);
  };

  const saveEdit = async (id: string) => {
    if (!editForm.text.trim()) return;
    await updateDoc(doc(db, 'todos', id), { 
      text: editForm.text, patientName: editForm.patientName, dueTime: editForm.dueTime
    });
    setEditingId(null);
  };

  // --- TIME HELPERS ---
  const getTimeRemaining = (dueDateStr: string, dueTimeStr?: string) => {
    if (!dueDateStr) return null;
    const due = parseISO(dueDateStr);
    if (dueTimeStr) {
      const [hours, mins] = dueTimeStr.split(':').map(Number);
      due.setHours(hours, mins, 0);
    } else {
      due.setHours(23, 59, 59);
    }

    if (isPast(due)) return { text: 'Overdue', color: 'text-rose-400' };
    
    const duration = intervalToDuration({ start: now, end: due });
    const parts = [];
    if (duration.days) parts.push(`${duration.days}d`);
    if (duration.hours) parts.push(`${duration.hours}h`);
    if (duration.minutes) parts.push(`${duration.minutes}m`); // Added minutes for precision
    
    // Only show top 2 significant units
    const text = parts.slice(0, 2).join(' ') + ' left'; 
    let color = 'text-indigo-300';
    if (!duration.months && !duration.days && duration.hours && duration.hours < 4) color = 'text-amber-400 font-bold';
    
    return { text, color };
  };

  const getTimeWaiting = (createdAt: any) => {
    if (!createdAt) return 'Just now';
    const createdDate = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date();
    const duration = intervalToDuration({ start: createdDate, end: now });
    const parts = [];
    if (duration.days) parts.push(`${duration.days}d`);
    if (duration.hours) parts.push(`${duration.hours}h`);
    return parts.length > 0 ? parts.join(' ') : 'Just now';
  };

  const setDueToday = () => setDueDate(format(new Date(), 'yyyy-MM-dd'));

  // --- RENDER TASK ITEM ---
  const TaskItem = ({ todo }: { todo: Todo }) => {
    const remaining = getTimeRemaining(todo.dueDate, todo.dueTime);
    const waiting = getTimeWaiting(todo.createdAt);
    const createdStr = todo.createdAt?.seconds 
      ? format(new Date(todo.createdAt.seconds * 1000), 'd MMM, HH:mm') 
      : 'Just now';

    return (
      <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`glass-panel p-4 flex flex-col sm:flex-row sm:items-start justify-between group border-l-4 mb-3 ${todo.completed ? 'border-l-slate-700 opacity-50 bg-slate-900/30' : 'border-l-indigo-500'}`}
      >
        <div className="flex items-start gap-4 w-full">
          {editingId !== todo.id && (
            <button onClick={() => toggleComplete(todo)} className="text-slate-500 hover:text-indigo-400 transition mt-1">
              {todo.completed ? <CheckCircle2 className="text-emerald-500/80" size={24} /> : <Circle size={24} />}
            </button>
          )}
          
          <div className="flex-1 min-w-0">
            {editingId === todo.id ? (
              <div className="flex flex-col gap-2 w-full pr-12">
                  <div className="flex gap-2 relative">
                    <input 
                      value={editForm.patientName}
                      onChange={(e) => setEditForm({ ...editForm, patientName: e.target.value })}
                      className="w-1/3 bg-slate-800/50 text-indigo-300 font-bold text-sm p-2 rounded border border-indigo-500/30 focus:outline-none"
                      placeholder="Patient Name"
                    />
                    
                    {/* EDIT MODE TIME DROPDOWN */}
                    <div className="relative">
                      <button 
                         onClick={() => setIsEditTimeOpen(!isEditTimeOpen)}
                         className="flex items-center gap-2 bg-slate-800/50 text-slate-300 text-sm p-2 rounded border border-indigo-500/30 hover:bg-slate-700/50 transition w-[100px] justify-between"
                      >
                         <div className="flex items-center gap-1">
                           <Clock size={14} />
                           {editForm.dueTime || "Time"}
                         </div>
                      </button>
                      
                      {isEditTimeOpen && (
                        <div className="absolute top-full left-0 mt-1 w-[120px] max-h-[200px] overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                           <button onClick={() => { setEditForm({...editForm, dueTime: ''}); setIsEditTimeOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-white/5 border-b border-white/5">No time</button>
                           {TIME_SLOTS.map(time => (
                             <button
                               key={time}
                               onClick={() => { setEditForm({...editForm, dueTime: time}); setIsEditTimeOpen(false); }}
                               className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-indigo-500/20 hover:text-indigo-300"
                             >
                               {time}
                             </button>
                           ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <input 
                    value={editForm.text}
                    onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(todo.id)}
                    className="w-full bg-slate-800/50 text-white p-2 rounded border border-indigo-500/50 focus:outline-none"
                    autoFocus
                  />
              </div>
            ) : (
              <div className={`${privacyMode ? 'blur-md hover:blur-none select-none duration-500' : ''}`}>
                <div className="flex items-center gap-3 mb-1">
                  {todo.patientName && (
                    <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-sm">
                      <UserIcon size={12} />
                      {todo.patientName}
                    </div>
                  )}
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                    {todo.category}
                  </span>
                </div>

                <p className={`text-lg transition-all ${todo.completed ? 'line-through decoration-slate-600 text-slate-500' : 'text-slate-200'}`}>
                  {todo.text}
                </p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-6 mt-3 text-xs text-slate-500 border-t border-white/5 pt-2 w-full max-w-[90%]">
                  <div>
                    <span className="block text-[10px] opacity-60 uppercase tracking-wide">Created</span>
                    <span className="text-slate-400">{createdStr}</span>
                  </div>

                  <div>
                     <span className="block text-[10px] opacity-60 uppercase tracking-wide">Waiting</span>
                     <div className="flex items-center gap-1 text-slate-400">
                       <Hourglass size={10} /> {waiting}
                     </div>
                  </div>

                  {remaining && !todo.completed && (
                    <div>
                      <span className="block text-[10px] opacity-60 uppercase tracking-wide">Remaining</span>
                      <span className={`font-medium ${remaining.color}`}>
                        {remaining.text}
                      </span>
                    </div>
                  )}
                  
                  {todo.dueDate && (
                    <div>
                      <span className="block text-[10px] opacity-60 uppercase tracking-wide">Due Date</span>
                      <div className="flex items-center gap-1 text-slate-300">
                        <Calendar size={10} />
                        {format(parseISO(todo.dueDate), 'd MMM')}
                        {todo.dueTime && <span className="text-indigo-300 ml-1"> {todo.dueTime}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 absolute top-4 right-4 sm:static sm:ml-4 self-start">
          {editingId === todo.id ? (
            <>
              <button onClick={() => saveEdit(todo.id)} className="text-emerald-400 hover:bg-emerald-400/10 p-2 rounded-lg transition"><Check size={18} /></button>
              <button onClick={() => setEditingId(null)} className="text-rose-400 hover:bg-rose-400/10 p-2 rounded-lg transition"><X size={18} /></button>
            </>
          ) : (
            <>
              <button onClick={() => startEditing(todo)} className="text-slate-500 hover:text-indigo-400 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 hover:bg-white/5 rounded-lg"><Pencil size={18} /></button>
              <button onClick={() => deleteTodo(todo.id)} className="text-slate-500 hover:text-rose-400 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 hover:bg-white/5 rounded-lg"><Trash2 size={18} /></button>
            </>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4">
      {/* HEADER */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent">Clinical Admin</h1>
          <div className="flex items-center gap-2 text-slate-400 mt-2 text-sm font-medium">
            <Clock size={16} /><span>{format(now, 'EEEE, do MMMM yyyy - HH:mm')}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition" size={16} />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Find patient..." className="bg-slate-900/50 border border-slate-700 rounded-full py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-indigo-500 w-[180px] transition-all" />
          </div>
          <button onClick={() => setPrivacyMode(!privacyMode)} className={`p-2 rounded-full border transition-all ${privacyMode ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>{privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}</button>
        </div>
      </header>

      {/* ADD FORM */}
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-8 relative z-20">
        <form onSubmit={addTodo} className="glass-panel p-2 pl-3 flex flex-wrap gap-3 items-center focus-within:ring-1 ring-indigo-500/50 transition-all">
          
          <div className="relative group min-w-[140px] max-w-[180px] flex-grow md:flex-grow-0">
            <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400" />
            <input type="text" value={patientInput} onChange={(e) => setPatientInput(e.target.value)} className="w-full bg-slate-900/50 border border-transparent focus:border-indigo-500/30 rounded-lg py-2 pl-9 pr-2 text-sm text-slate-200 focus:outline-none transition-all placeholder-slate-600" placeholder="Patient Name" />
          </div>
          
          <div className="hidden md:block h-8 w-[1px] bg-white/10"></div>
          
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 bg-transparent border-none focus:outline-none text-lg placeholder-slate-600 h-10 text-slate-200 min-w-[180px]" placeholder="Task details..." />
          
          {/* DATE & TIME CONTROLS */}
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
             <button type="button" onClick={setDueToday} className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-white/5 rounded-md transition" title="Due Today"><Target size={18} /></button>
             <div className="w-[1px] h-4 bg-slate-600"></div>
             <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-transparent text-slate-400 text-sm outline-none cursor-pointer hover:text-white px-2 w-[110px]" />
             
             <div className="w-[1px] h-4 bg-slate-600"></div>
             
             {/* CUSTOM TIME DROPDOWN */}
             <div className="relative" ref={timeDropdownRef}>
               <button 
                 type="button" 
                 onClick={() => setIsTimeOpen(!isTimeOpen)}
                 className="flex items-center gap-1 bg-transparent text-slate-400 text-sm hover:text-white px-2 py-1 transition min-w-[70px] justify-center"
               >
                 <Clock size={14} />
                 <span>{dueTime || "Time"}</span>
               </button>

               {isTimeOpen && (
                 <div className="absolute top-full right-0 mt-2 w-[100px] max-h-[200px] overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                   <button onClick={() => { setDueTime(''); setIsTimeOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-white/5 border-b border-white/5">No time</button>
                   {TIME_SLOTS.map(time => (
                     <button
                       key={time}
                       type="button"
                       onClick={() => { setDueTime(time); setIsTimeOpen(false); }}
                       className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-indigo-500/20 hover:text-indigo-300"
                     >
                       {time}
                     </button>
                   ))}
                 </div>
               )}
             </div>
          </div>

          {/* CATEGORY DROPDOWN */}
          <div className="relative min-w-[120px]" ref={catDropdownRef}>
             <button type="button" onClick={() => setIsCatOpen(!isCatOpen)} className="w-full flex items-center justify-between gap-2 bg-slate-800/50 border border-slate-700/50 hover:border-indigo-500/50 px-3 py-2 rounded-lg text-sm text-slate-300 transition"><span className="truncate">{category}</span><ChevronDown size={14} className={`transition-transform ${isCatOpen ? 'rotate-180' : ''}`} /></button>
             {isCatOpen && (
               <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="absolute top-full right-0 mt-2 w-[180px] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 py-1">
                 {categories.map(c => (<button key={c} type="button" onClick={() => { setCategory(c); setIsCatOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition ${category === c ? 'text-indigo-400 bg-white/5' : 'text-slate-300'}`}>{c}</button>))}
               </motion.div>
             )}
          </div>
          <button type="submit" className="bg-indigo-600 w-10 h-10 rounded-lg hover:bg-indigo-500 transition flex items-center justify-center text-white shadow-lg active:scale-90 ml-auto md:ml-0"><Plus size={20} /></button>
        </form>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2 scrollbar-hide">{QUICK_TEMPLATES.map(tmpl => (<button key={tmpl} onClick={() => setInput(tmpl + ' ')} className="text-xs font-medium bg-slate-800/50 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:border-indigo-500/30 transition whitespace-nowrap">+ {tmpl}</button>))}</div>
      </motion.div>

      {/* --- SECTIONS --- */}
      <div className="pb-20 relative z-10 space-y-4">
        {isLoading && <div className="text-center text-slate-500 py-10">Syncing workspace...</div>}

        {/* 1. OVERDUE */}
        {!isLoading && groupedTodos.overdue.length > 0 && (
          <div className="space-y-2">
            <button onClick={() => toggleSection('overdue')} className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider text-xs w-full hover:bg-white/5 p-2 rounded-lg transition">
              {sections.overdue ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Overdue ({groupedTodos.overdue.length})
              <AlertTriangle size={14} />
            </button>
            <AnimatePresence>
              {sections.overdue && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {groupedTodos.overdue.map(todo => <TaskItem key={todo.id} todo={todo} />)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 2. DUE WITHIN 24H */}
        {!isLoading && (
          <div className="space-y-2">
            <button onClick={() => toggleSection('soon')} className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider text-xs w-full hover:bg-white/5 p-2 rounded-lg transition">
               {sections.soon ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
               Due Within 24 Hours ({groupedTodos.soon.length})
            </button>
            <AnimatePresence>
              {sections.soon && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {groupedTodos.soon.map(todo => <TaskItem key={todo.id} todo={todo} />)}
                  {groupedTodos.soon.length === 0 && <p className="text-slate-600 text-sm pl-8 py-2 italic">No urgent tasks.</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 3. DUE LATER */}
        {!isLoading && (
          <div className="space-y-2">
            <button onClick={() => toggleSection('later')} className="flex items-center gap-2 text-indigo-300 font-bold uppercase tracking-wider text-xs w-full hover:bg-white/5 p-2 rounded-lg transition">
               {sections.later ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
               Later / No Date ({groupedTodos.later.length})
            </button>
            <AnimatePresence>
              {sections.later && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {groupedTodos.later.map(todo => <TaskItem key={todo.id} todo={todo} />)}
                  {groupedTodos.later.length === 0 && <p className="text-slate-600 text-sm pl-8 py-2 italic">Nothing for later.</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 4. COMPLETED */}
        {!isLoading && groupedTodos.completed.length > 0 && (
          <div className="space-y-2 pt-6 border-t border-white/5">
            <button onClick={() => toggleSection('completed')} className="flex items-center gap-2 text-slate-500 font-bold uppercase tracking-wider text-xs w-full hover:bg-white/5 p-2 rounded-lg transition">
               {sections.completed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
               Completed ({groupedTodos.completed.length})
            </button>
            <AnimatePresence>
              {sections.completed && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {groupedTodos.completed.map(todo => <TaskItem key={todo.id} todo={todo} />)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}