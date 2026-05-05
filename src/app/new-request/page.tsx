'use client'
import { useState, useEffect } from 'react'
import { School, ServiceType, DocumentationType } from '@/types'
import { CheckCircle2, Upload, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

const SCHOOLS: School[] = ['SNAHS','SBAHM','SITE','SASTE','School of Medicine','BEU']
const SERVICES: ServiceType[] = ['CMAC','PMAC']
const DOC_TYPES: DocumentationType[] = ['PHOTO','VIDEO','BOTH']
const VENUES = [
  'SC(Students Center)',
  'BEU Gym',
  'MM Hall',
  'Global Function Room whole',
  'Global Function Room 1',
  'Global Function Room 2',
  'Global Function Room 3',
  'SNAHS Highflex'
]

type Step = 1 | 2 | 3 | 4

import { createServiceRequest, checkConflict } from './actions'
import { useSession } from 'next-auth/react'

export default function NewRequestPage() {
  const { data: session } = useSession()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    school: (session?.user as any)?.school || '' as School | '',
    eventTitle: '',
    eventDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    eventVenue: '',
    letterContent: '',
    serviceType: '' as ServiceType | '',
    documentationType: '' as DocumentationType | '',
    letterFile: null as File | null,
    requestedBy: session?.user?.name || '',
    needsSoundSystem: false,
    needsSameDayEdit: false,
    needsICTPersonnel: false,
    hasOnlineSpeaker: false,
    campusType: '' as 'IN_CAMPUS' | 'OFF_CAMPUS' | '',
  })
  const [stepError, setStepError] = useState<string>('')
  const [submissionMethod, setSubmissionMethod] = useState<'upload' | 'generate'>('upload')

  function validateStep1(): string {
    if (!form.school) return 'Department/School is required.'
    if (!form.eventTitle.trim()) return 'Event title is required.'
    if (!form.eventDate) return 'Start date is required.'
    if (!form.endDate) return 'End date is required (select same day if one-day event).'
    if (!form.startTime) return 'Start time is required.'
    if (!form.endTime) return 'End time is required.'
    const isSameDay = !form.endDate || form.eventDate === form.endDate;
    if (isSameDay && form.startTime && form.endTime && form.startTime >= form.endTime) {
      return 'End time must be after start time for single-day events.'
    }
    
    if (form.endDate && form.endDate < form.eventDate) return 'End date cannot be before start date.'
    
    const today = new Date();
    const eventDate = new Date(form.eventDate);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Event date cannot be in the past.'
    if (diffDays < 3) return 'Service requests must be submitted at least 3 days in advance.'
    
    if (!form.eventVenue) return 'Venue is required.'
    return ''
  }

  function validateStep3(): string {
    if (!form.campusType) return 'Please select whether the event is in-campus or off-campus.'
    if (!form.serviceType) return 'Please select a service type (CMAC or PMAC).'
    if (!form.documentationType) return 'Please select a documentation type.'
    return ''
  }
  const [submitted, setSubmitted] = useState(false)
  const [conflicts, setConflicts] = useState<{title: string, startTime: string | null, endTime: string | null}[]>([])
  const [step1Conflicts, setStep1Conflicts] = useState<{title: string, startTime: string | null, endTime: string | null, status: string}[]>([])
  const [sameDayEvents, setSameDayEvents] = useState<{title: string, startTime: string | null, endTime: string | null, status: string}[]>([])

  // Real-time conflict check on Step 1 date/time change
  useEffect(() => {
    if (!form.eventDate) {
      setStep1Conflicts([])
      setSameDayEvents([])
      return
    }
    const timer = setTimeout(async () => {
      const res = await checkConflict(
        form.eventDate, 
        form.startTime || undefined, 
        form.endDate || undefined,
        form.endTime || undefined,
        form.eventVenue || undefined
      )
      setStep1Conflicts(res.conflicts || [])
      setSameDayEvents(res.sameDayEvents || [])
    }, 500)
    return () => clearTimeout(timer)
  }, [form.eventDate, form.startTime, form.endTime, form.eventVenue, form.endDate])

  useEffect(() => {
    if (session?.user && (session.user as any).school) {
      setForm(prev => ({ ...prev, school: (session.user as any).school }));
    }
  }, [session])

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const generateLetterTemplate = () => {
    const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    const template = `Date: ${date}

TO: THE CMAC COORDINATOR
ICT Division, SPUP

Dear Sir/Ma'am,

I am writing to formally request documentation services for the upcoming event titled "${form.eventTitle || '[Event Title]'}" scheduled on ${form.eventDate || '[Date]'} at ${form.eventVenue || '[Venue]'}.

We would like to request for ${form.serviceType || 'CMAC'} services, specifically ${form.documentationType === 'BOTH' ? 'Photo and Video' : (form.documentationType || 'documentation')} coverage.

Thank you for your continuous support.

Sincerely,

${form.requestedBy || (session?.user?.name || '[Your Name]')}
Secretary, ${form.school || '[School/Department]'}`
    
    set('letterContent', template)
  }

  async function submit() {
    const e1 = validateStep1()
    const e2 = validateStep3()
    if (e1) { setStep(1); setStepError(e1); return }
    if (e2) { setStep(2); setStepError(e2); return }
    setStepError('')

    if (loading) return
    setLoading(true)
    
    try {
      console.log('Attempting submission...', form)
      
      // Create a timeout promise
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Submission timed out. The server might be busy.')), 15000)
      )

      // Race the action against the timeout
      const res = await Promise.race([
        createServiceRequest({
          eventTitle: form.eventTitle,
          eventDate: form.eventDate,
          endDate: form.endDate,
          startTime: form.startTime,
          endTime: form.endTime,
          eventVenue: form.eventVenue,
          letterContent: submissionMethod === 'generate' ? form.letterContent : null,
          school: form.school as any,
          serviceType: form.serviceType as any,
          documentationType: form.documentationType as any,
          letterUrl: submissionMethod === 'upload' ? (form.letterFile?.name || null) : 'generated-letter.pdf',
          needsSoundSystem: form.needsSoundSystem,
          needsSameDayEdit: form.needsSameDayEdit,
          needsICTPersonnel: form.needsICTPersonnel,
          hasOnlineSpeaker: form.hasOnlineSpeaker,
          campusType: form.campusType as any
        }),
        timeout
      ]) as any
      
      if (res.success) {
        setSubmitted(true)
      } else {
        alert(`Submission Failed: ${res.error}`)
      }
    } catch (e: any) {
      console.error('Submission Error:', e)
      alert('A technical error occurred: ' + (e.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 size={40} className="text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-3xl text-slate-800 font-black">Success!</h2>
          <p className="text-slate-500 font-medium">Your requisition has been logged and sent for review.</p>
        </div>
        <button
          onClick={() => { setSubmitted(false); setStep(1); setForm({ school:'', eventTitle:'', eventDate:'', endDate:'', startTime:'', endTime:'', eventVenue:'', letterContent: '', serviceType:'', documentationType:'', letterFile:null, requestedBy:'', needsSoundSystem: false, needsSameDayEdit: false, needsICTPersonnel: false, hasOnlineSpeaker: false, campusType: '' }) }}
          className="mx-auto flex items-center gap-2 bg-[#064e3b] text-white px-8 py-3 rounded-2xl text-sm font-bold hover:bg-[#065f46] shadow-xl shadow-emerald-900/20 transition-all"
        >
          Create New Requisition
        </button>
      </div>
    )
  }

  const steps = [
    { n: 1, label: 'Basic' },
    { n: 2, label: 'Services' },
    { n: 3, label: 'Requisition' },
    { n: 4, label: 'Confirm' },
  ]

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-20">
      {/* Progress */}
      <div className="flex items-center gap-0 mb-12">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-2">
              <div className={clsx(
                'w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black border-2 transition-all duration-500',
                step > s.n ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
                step === s.n ? 'bg-[#064e3b] border-[#064e3b] text-white shadow-lg shadow-emerald-900/30' :
                'bg-white border-slate-200 text-slate-300'
              )}>
                {step > s.n ? <CheckCircle2 size={18} /> : s.n}
              </div>
              <span className={clsx('text-[10px] font-black uppercase tracking-widest hidden sm:block transition-colors', step === s.n ? 'text-emerald-700' : 'text-slate-400')}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={clsx('flex-1 h-1 mx-3 rounded-full', step > s.n ? 'bg-emerald-400' : 'bg-slate-100')} />
            )}
          </div>
        ))}
      </div>

      <div className="card p-10 space-y-8">
        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-display text-2xl text-slate-800 font-bold">General Information</h2>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">School / Department</label>
              <div className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-500 cursor-not-allowed">
                {form.school || 'Loading Department...'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Event Title</label>
              <input type="text" value={form.eventTitle} onChange={e => set('eventTitle', e.target.value)}
                placeholder="e.g. Founding Anniversary 2026"
                className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Start Date</label>
                <input type="date" value={form.eventDate} 
                  onChange={e => {
                    const newDate = e.target.value;
                    setForm(prev => ({
                      ...prev,
                      eventDate: newDate,
                      // Auto-sync endDate if it's empty or was the same as previous start date
                      endDate: (!prev.endDate || prev.endDate === prev.eventDate) ? newDate : prev.endDate
                    }));
                  }}
                  className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">End Date</label>
                <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
                  className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Start Time</label>
                <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)}
                  className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">End Time</label>
                <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)}
                  className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Venue</label>
              <select 
                value={form.eventVenue} 
                onChange={e => set('eventVenue', e.target.value)}
                className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500 bg-white"
              >
                <option value="">Select Venue...</option>
                {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Inline conflict warning */}
            {(step1Conflicts.length > 0 || sameDayEvents.length > 0) && (
              <div className={clsx(
                "rounded-2xl p-5 border animate-fade-in",
                step1Conflicts.length > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
              )}>
                <div className="flex items-start gap-4">
                  <div className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-black flex-shrink-0 text-lg shadow-sm",
                    step1Conflicts.length > 0 ? "bg-red-500 text-white" : "bg-amber-400 text-white"
                  )}>
                    {step1Conflicts.length > 0 ? "!" : "i"}
                  </div>
                  <div className="flex-1">
                    <p className={clsx("font-black text-sm", step1Conflicts.length > 0 ? "text-red-700" : "text-amber-800")}>
                      {step1Conflicts.length > 0 ? "Direct Scheduling Conflict!" : "Busy Date Notice"}
                    </p>
                    
                    {step1Conflicts.length > 0 ? (
                      <div className="mt-2">
                        <p className="text-red-600 text-xs font-bold leading-relaxed">
                          The venue <span className="underline decoration-red-300 decoration-2">{form.eventVenue}</span> is already booked during this time. 
                          <span className="block mt-1 uppercase tracking-wider text-[10px] bg-red-100 inline-block px-2 py-0.5 rounded text-red-700">
                            Warning: Direct conflict! Likely to be rejected.
                          </span>
                        </p>
                        <ul className="mt-3 space-y-1.5">
                          {step1Conflicts.map((c, i) => (
                            <li key={i} className="text-[10px] font-black text-red-800 bg-white/50 border border-red-100 px-3 py-2 rounded-xl flex justify-between items-center">
                              <span className="truncate pr-2">{c.title}</span>
                              <span className="whitespace-nowrap tabular-nums opacity-60">{c.startTime} - {c.endTime}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-amber-700 text-xs font-medium leading-relaxed">
                          Other events are scheduled for this date in different venues:
                        </p>
                        <ul className="mt-3 space-y-1.5">
                          {sameDayEvents.map((c: any, i: number) => (
                            <li key={i} className="text-[10px] font-bold text-amber-800 bg-white/50 border border-amber-100 px-3 py-1.5 rounded-lg flex justify-between items-center">
                              <span className="truncate pr-2">{c.title} <span className="opacity-40 ml-1">@ {c.venue}</span></span>
                              <span className="whitespace-nowrap tabular-nums opacity-60">{c.startTime} - {c.endTime}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Service Selection & Add-ons */}
        {step === 2 && (
          <div className="space-y-8">
            <div className="space-y-6">
              <h2 className="font-display text-2xl text-slate-800 font-bold">Service Selection</h2>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Event Location</label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'IN_CAMPUS', label: 'In-Campus' },
                    { id: 'OFF_CAMPUS', label: 'Off-Campus' },
                  ].map(c => (
                    <button key={c.id} onClick={() => set('campusType', c.id as any)}
                      className={clsx(
                        'py-6 rounded-2xl border-2 font-black text-xl transition-all shadow-sm',
                        form.campusType === c.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-100 text-slate-300 hover:border-emerald-200'
                      )}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Service Type</label>
                <div className="grid grid-cols-2 gap-4">
                  {SERVICES.map(s => (
                    <button key={s} onClick={() => set('serviceType', s)}
                      className={clsx(
                        'py-6 rounded-2xl border-2 font-black text-xl transition-all shadow-sm',
                        form.serviceType === s
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-100 text-slate-300 hover:border-emerald-200'
                      )}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Documentation Requirement</label>
                <div className="grid grid-cols-3 gap-3">
                  {DOC_TYPES.map(d => (
                    <button key={d} onClick={() => set('documentationType', d)}
                      className={clsx(
                        'py-4 rounded-xl border-2 font-bold text-sm transition-all',
                        form.documentationType === d
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-100 text-slate-400 hover:border-emerald-200'
                      )}>
                      {d === 'BOTH' ? 'Photo + Video' : d.charAt(0) + d.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Additional Requirements</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: 'needsSoundSystem', label: 'Same-Day Photo Delivery', desc: 'High-quality photos delivered within the same day' },
                    { id: 'needsSameDayEdit', label: 'Same Day Edit', desc: 'Quick video edit to be shown during the event' },
                    { id: 'needsICTPersonnel', label: 'Standby ICT Personnel', desc: 'Technical support throughout the event' },
                  ].map(item => (
                    <label key={item.id} className={clsx(
                      "flex items-start gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer group",
                      (form as any)[item.id] ? "border-emerald-500 bg-emerald-50/50" : "border-slate-100 hover:border-emerald-200"
                    )}>
                      <input 
                        type="checkbox" 
                        checked={(form as any)[item.id]} 
                        onChange={e => set(item.id as any, e.target.checked)}
                        className="w-5 h-5 mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">{item.label}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-1">{item.desc}</p>
                      </div>
                    </label>
                  ))}

                  {(form.eventVenue.includes('Global') || form.eventVenue.includes('MM Hall') || form.eventVenue.includes('Highflex')) && (
                    <label className={clsx(
                      "flex items-start gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer group animate-fade-in",
                      form.hasOnlineSpeaker ? "border-emerald-500 bg-emerald-50/50" : "border-slate-100 hover:border-emerald-200"
                    )}>
                      <input 
                        type="checkbox" 
                        checked={form.hasOnlineSpeaker} 
                        onChange={e => set('hasOnlineSpeaker', e.target.checked)}
                        className="w-5 h-5 mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-emerald-700">Online Speaker</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-1">Setup cameras and streaming for virtual participants</p>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Official Requisition */}
        {step === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-display text-2xl text-slate-800 font-bold">Official Requisition</h2>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setSubmissionMethod('upload')}
                  className={clsx('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all', submissionMethod === 'upload' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400')}
                >
                  Upload
                </button>
                <button 
                  onClick={() => { setSubmissionMethod('generate'); if(!form.letterContent) generateLetterTemplate(); }}
                  className={clsx('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all', submissionMethod === 'generate' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400')}
                >
                  Create Letter
                </button>
              </div>
            </div>

            {submissionMethod === 'upload' ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-500 font-medium">Upload your signed MS Word or PDF document.</p>
                <label className="block border-2 border-dashed border-emerald-100 rounded-[2rem] p-16 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group relative overflow-hidden">
                  <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => set('letterFile', e.target.files?.[0] ?? null)} />
                  <div className="relative z-10">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-900/5 group-hover:scale-110 transition-transform duration-500">
                      <Upload size={36} className="text-emerald-500" />
                    </div>
                    {form.letterFile
                      ? <p className="text-lg font-black text-emerald-700">{form.letterFile.name}</p>
                      : <>
                          <p className="text-lg font-black text-[var(--text-dark)] tracking-tight">Drop your document here</p>
                          <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">or click to browse</p>
                        </>
                    }
                  </div>
                </label>
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500 font-medium">Compose your official request letter here.</p>
                  <button onClick={generateLetterTemplate} className="text-[10px] font-black text-emerald-600 uppercase hover:underline">Reset to Template</button>
                </div>
                <textarea
                  value={form.letterContent}
                  onChange={e => set('letterContent', e.target.value)}
                  rows={15}
                  className="w-full border-2 border-emerald-50 rounded-2xl px-6 py-6 text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 leading-relaxed font-mono bg-slate-50/30"
                />
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Confirmation */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="font-display text-2xl text-slate-800 font-bold">Review Request</h2>
            
            {conflicts.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl animate-fade-in shadow-sm shadow-amber-900/5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0 font-black text-xl">
                    !
                  </div>
                  <div>
                    <h3 className="text-amber-800 font-bold text-sm uppercase tracking-widest">Potential Schedule Conflict</h3>
                    <p className="text-amber-700 text-xs mt-1 font-medium">There are existing bookings overlapping with your requested time:</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {conflicts.map((c, i) => (
                        <span key={i} className="text-amber-900 text-xs font-bold bg-amber-200/50 px-3 py-1.5 rounded-lg border border-amber-200">
                          {c.title} <span className="opacity-50 mx-1">|</span> {c.startTime} - {c.endTime}
                        </span>
                      ))}
                    </div>
                    <p className="text-amber-700 text-[10px] mt-3 font-bold uppercase tracking-widest opacity-80">Proceeding may result in a rejected request if resources are unavailable.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl overflow-hidden border border-emerald-100 divide-y divide-emerald-50">
              {[
                ['School', form.school],
                ['Event', form.eventTitle],
                ['Start Date', form.eventDate ? new Date(form.eventDate).toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) : '—'],
                ['End Date', form.endDate ? new Date(form.endDate).toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) : '—'],
                ['Time', `${form.startTime} - ${form.endTime}`],
                ['Venue', form.eventVenue],
                ['Location', form.campusType === 'IN_CAMPUS' ? 'In-Campus' : 'Off-Campus'],
                ['Service', form.serviceType],
                ['Documentation', form.documentationType === 'BOTH' ? 'Photo + Video' : form.documentationType],
                ['Document', submissionMethod === 'generate' ? 'In-App Generated Letter' : (form.letterFile?.name ?? 'Not uploaded')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-6 py-4 text-sm">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{k}</span>
                  <span className="text-slate-700 font-bold">{v || '—'}</span>
                </div>
              ))}
            </div>

          </div>
        )}
        
        {/* Step error banner */}
        {stepError && (
          <div className="mx-0 mt-2 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-5 py-3 rounded-2xl flex items-center gap-3 animate-fade-in">
            <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 font-black text-red-600">!</span>
            {stepError}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => setStep(s => (s > 1 ? (s - 1) as Step : s))}
            disabled={step === 1}
            className="px-6 py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-0"
          >
            ← Previous
          </button>
          {step < 4
            ? <button
                onClick={async () => {
                  const nextStep = (step + 1) as Step;
                  // Run validation before advancing
                  if (step === 1) {
                    const err = validateStep1()
                    if (err) { setStepError(err); return }
                  }
                  if (step === 2) {
                    const err = validateStep3()
                    if (err) { setStepError(err); return }
                  }
                  setStepError('')
                  if (nextStep === 3 && submissionMethod === 'generate' && !form.letterContent) {
                    generateLetterTemplate();
                  }
                  if (nextStep === 4) {
                    const res = await checkConflict(form.eventDate, form.startTime, form.endTime);
                    setConflicts(res.conflicts || []);
                  }
                  setStep(nextStep);
                }}
                className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold bg-[#064e3b] text-white hover:bg-[#065f46] shadow-lg shadow-emerald-900/20 transition-all"
              >
                Next Step <ChevronRight size={16} />
              </button>
            : <button
                onClick={submit}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-[#064e3b] text-white py-5 rounded-2xl font-black text-lg shadow-2xl shadow-emerald-900/30 hover:bg-[#065f46] transform hover:-translate-y-1 transition-all disabled:opacity-50 disabled:transform-none"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing Requisition...</span>
                  </>
                ) : 'Confirm Submission'}
              </button>
          }
        </div>
      </div>
    </div>
  )
}
