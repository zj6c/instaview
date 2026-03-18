import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'

const AuthContext = createContext(null)

// ── Simple local auth (when Supabase is not configured) ───────────────────────
const LOCAL_KEY = 'instaview_user'
function getLocalUser() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) } catch { return null }
}
function setLocalUser(u) {
  if (u) localStorage.setItem(LOCAL_KEY, JSON.stringify(u))
  else    localStorage.removeItem(LOCAL_KEY)
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (hasSupabase) {
      // Real Supabase auth
      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          setUser(session?.user ?? null)
          setLoading(false)
        })
        .catch(() => { setLoading(false) })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
        setUser(session?.user ?? null)
      })
      return () => subscription.unsubscribe()
    } else {
      // Local auth fallback — always works
      setUser(getLocalUser())
      setLoading(false)
    }
  }, [])

  const signIn = async (email, password) => {
    if (hasSupabase) {
      return supabase.auth.signInWithPassword({ email, password })
    }
    // Local: accept any email/password
    const u = { id: 'local', email, created_at: new Date().toISOString() }
    setLocalUser(u)
    setUser(u)
    return { error: null }
  }

  const signUp = async (email, password) => {
    if (hasSupabase) {
      return supabase.auth.signUp({ email, password })
    }
    const u = { id: 'local', email, created_at: new Date().toISOString() }
    setLocalUser(u)
    setUser(u)
    return { error: null }
  }

  const signOut = async () => {
    if (hasSupabase) await supabase.auth.signOut()
    setLocalUser(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
