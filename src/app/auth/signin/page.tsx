'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Aperture, Sparkles, Camera } from 'lucide-react'
import ThemeToggle from '@/components/theme/ThemeToggle'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false
    })

    if (res?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface)] p-4 md:p-8">
      <div className="fixed right-4 top-4 z-30 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <div className="max-w-6xl w-full flex bg-white shadow-[0_32px_64px_-12px_rgba(6,78,59,0.15)] rounded-[2.5rem] overflow-hidden border border-emerald-100/50">
        {/* Left Side: Mascot/Banner */}
        <div className="hidden lg:block w-[55%] bg-[#022c22] relative p-16 overflow-hidden dark:bg-[#1a2d42]">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-emerald-500/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-emerald-400/10 rounded-full blur-[120px]"></div>
          
          <div className="relative z-10 h-full flex flex-col">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Portal Access</span>
              </div>
              <h2 className="text-6xl font-display font-extrabold text-white leading-[1.1] tracking-tight">
                Design the <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 dark:from-[#aab7b7] dark:to-[#d4d8dd]">Future</span> <br/> with CMAC.
              </h2>
              <p className="text-emerald-100/60 text-lg leading-relaxed max-w-sm">
                Official documentation & coverage portal of <br/> St. Paul University Philippines.
              </p>
            </div>
            
            <div className="mt-auto flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10 text-emerald-300">
                <Aperture size={24} />
              </div>
              <div>
                <p className="text-white font-bold text-sm">ICT CMAC Division</p>
                <p className="text-emerald-500/80 text-[10px] font-bold uppercase tracking-widest">© 2026 St. Paul University Philippines</p>
              </div>
            </div>
          </div>

          {/* Abstract Geometry Banner Replacement */}
          <div className="absolute bottom-0 right-0 w-[90%] h-[85%] pointer-events-none select-none overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-t from-[#022c22] via-transparent to-transparent z-20"></div>
             
             {/* Main Graphic */}
             <div className="absolute -bottom-10 -right-10 w-[120%] h-[120%] z-10 flex items-center justify-center opacity-80">
                <div className="relative w-full h-full animate-float">
                  {/* Floating elements */}
                  <div className="absolute top-[20%] left-[20%] w-32 h-32 bg-emerald-500/20 rounded-3xl backdrop-blur-3xl border border-white/10 rotate-12 flex items-center justify-center text-emerald-300/50">
                    <Camera size={50} strokeWidth={1} />
                  </div>
                  <div className="absolute top-[40%] right-[15%] w-48 h-48 bg-teal-400/20 rounded-full backdrop-blur-xl border border-white/5 -rotate-12 flex items-center justify-center text-teal-300/30">
                    <Aperture size={75} strokeWidth={0.5} />
                  </div>
                  <div className="absolute bottom-[25%] left-[30%] w-24 h-24 bg-white/5 rounded-2xl backdrop-blur-md border border-white/10 rotate-45 flex items-center justify-center text-white/30">
                    <Sparkles size={32} />
                  </div>
                  
                  {/* Glows */}
                  <div className="absolute top-[30%] right-[30%] w-64 h-64 bg-emerald-400/30 blur-[80px] rounded-full mix-blend-screen"></div>
                  <div className="absolute bottom-[30%] left-[40%] w-64 h-64 bg-teal-500/20 blur-[100px] rounded-full mix-blend-screen"></div>
                </div>
             </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="flex-1 p-10 md:p-20 flex flex-col justify-center relative bg-white">
          <div className="max-w-md w-full mx-auto space-y-12">
            <div className="space-y-4">
              <div className="lg:hidden mb-8 text-emerald-600">
                <Aperture size={64} strokeWidth={1.5} />
              </div>
              <h1 className="text-5xl font-display font-black tracking-tighter text-slate-900 flex items-center gap-1">
                Login<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400 dark:from-[#aab7b7] dark:to-[#d4d8dd]">.</span>
              </h1>
              <p className="text-slate-400 text-lg font-medium">Please enter your credentials to continue.</p>
            </div>
            
            {error && (
              <div className="bg-red-50 text-red-600 p-5 rounded-2xl text-sm font-bold border border-red-100 flex items-center gap-3 animate-shake">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Work Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full border-2 border-slate-100 rounded-[1.25rem] px-6 py-4 text-sm font-bold focus:outline-none focus:border-[var(--primary-light)] focus:ring-4 focus:ring-emerald-50 transition-all bg-slate-50/50"
                  placeholder="name@university.edu"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Security Code</label>
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full border-2 border-slate-100 rounded-[1.25rem] px-6 py-4 text-sm font-bold focus:outline-none focus:border-[var(--primary-light)] focus:ring-4 focus:ring-emerald-50 transition-all bg-slate-50/50"
                  placeholder="••••••••"
                />
              </div>
              
              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] text-white rounded-[1.25rem] py-5 text-sm font-black shadow-2xl shadow-emerald-900/30 hover:shadow-emerald-900/40 transform hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300"
              >
                Sign In to Workspace
              </button>
            </form>
            
            <div className="pt-6 border-t border-slate-100">
              <p className="text-xs text-slate-400 leading-relaxed">
                Authorized access only. By continuing, you agree to the <span className="text-emerald-600 font-bold hover:underline cursor-pointer">Security Protocol</span> and <span className="text-emerald-600 font-bold hover:underline cursor-pointer">Privacy Policy</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
