import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute  from './components/ProtectedRoute'
import AuthPage        from './pages/AuthPage'
import AppPage         from './pages/AppPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/"    element={<AuthPage/>}/>
          <Route path="/app" element={
            <ProtectedRoute><AppPage/></ProtectedRoute>
          }/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
