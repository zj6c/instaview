import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Loader2 } from 'lucide-react'

export default function AuthPage() {
  const [mode,     setMode]     = useState('login')   // 'login' | 'signup'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess('')

    const fn = mode === 'login' ? signIn : signUp
    const { error: err } = await fn(email, password)

    setLoading(false)
    if (err) {
      const msgs = {
        'Invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        'Email not confirmed':        'يرجى تأكيد بريدك الإلكتروني أولاً',
        'User already registered':    'هذا البريد الإلكتروني مسجل بالفعل',
        'Password should be at least 6 characters': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
      }
      setError(msgs[err.message] || err.message)
    } else {
      if (mode === 'signup') {
        setSuccess('تم إنشاء الحساب! تحقق من بريدك الإلكتروني لتأكيد الحساب.')
      } else {
        navigate('/app')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #dc2743 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #bc1888 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
             style={{ background: 'radial-gradient(circle, #3797f0 0%, transparent 70%)' }} />
      </div>

      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none"
           style={{
             backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
             backgroundSize: '40px 40px'
           }} />

      <div className="w-full max-w-sm relative animate-[slideUp_.4s_ease_both]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-ig-grad mb-3 flex items-center justify-center text-2xl shadow-lg glow-pink">
            📷
          </div>
          <h1 className="text-2xl font-bold text-ig-grad" style={{ letterSpacing: '-0.5px' }}>
            InstaView
          </h1>
          <p className="text-xs text-ig-muted mt-1">أرشيف محادثاتك بتصميم أنيق</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-6 border border-ig-border glow-pink">
          {/* Tab switcher */}
          <div className="flex bg-[#0d0d0d] rounded-xl p-1 mb-6 border border-ig-border">
            {['login','signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  mode === m
                    ? 'bg-ig-blue text-white shadow-sm'
                    : 'text-ig-muted hover:text-ig-text'
                }`}>
                {m === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
              </button>
            ))}
          </div>

          <form onSubmit={handle} className="space-y-4">
            {/* Email */}
            <div className="relative">
              <Mail size={15} className="absolute top-1/2 -translate-y-1/2 right-4 text-ig-muted" />
              <input
                type="email" required placeholder="البريد الإلكتروني"
                value={email} onChange={e => setEmail(e.target.value)}
                className="input-field pr-10 text-right"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock size={15} className="absolute top-1/2 -translate-y-1/2 right-4 text-ig-muted" />
              <input
                type={showPw ? 'text' : 'password'} required placeholder="كلمة المرور"
                value={password} onChange={e => setPassword(e.target.value)}
                className="input-field pr-10 pl-10 text-right"
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute top-1/2 -translate-y-1/2 left-4 text-ig-muted hover:text-ig-text transition-colors">
                {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>

            {/* Error / Success */}
            {error && (
              <div className="text-xs text-center py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="text-xs text-center py-2 px-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
                {success}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-ig-grad text-white text-sm font-semibold
                         transition-all duration-200 hover:opacity-90 active:scale-[.98]
                         disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 glow-pink">
              {loading
                ? <><Loader2 size={16} className="animate-spin"/> جاري التحميل…</>
                : mode === 'login' ? 'دخول' : 'إنشاء الحساب'
              }
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-ig-border"/>
            <span className="text-xs text-ig-muted">أو</span>
            <div className="flex-1 h-px bg-ig-border"/>
          </div>

          <p className="text-center text-xs text-ig-muted">
            {mode === 'login'
              ? <>ليس عندك حساب؟{' '}
                  <button onClick={() => setMode('signup')} className="text-ig-blue hover:underline font-medium">أنشئ حساباً</button>
                </>
              : <>عندك حساب؟{' '}
                  <button onClick={() => setMode('login')} className="text-ig-blue hover:underline font-medium">سجّل دخول</button>
                </>
            }
          </p>
        </div>

        {/* Footer note */}
        <p className="text-center text-[11px] text-ig-muted mt-4 opacity-50">
          InstaView · مشروع شخصي خاص
        </p>
      </div>
    </div>
  )
}
