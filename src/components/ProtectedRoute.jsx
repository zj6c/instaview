import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-ig-blue border-t-transparent animate-spin"/>
    </div>
  )
  return user ? children : <Navigate to="/" replace/>
}
