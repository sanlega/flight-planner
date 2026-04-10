import { useState } from 'react'
import { Plane, Loader2, AlertCircle } from 'lucide-react'
import { login, register, type AuthUser } from '../api/auth'

interface Props {
  onLogin: (user: AuthUser) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = mode === 'login'
        ? await login(username, password)
        : await register(username, password)
      onLogin(user)
    } catch (err: any) {
      setError(err.message ?? 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4">
            <Plane className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Flight Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor de precios de vuelos</p>
        </div>

        {/* Form card */}
        <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">
            {mode === 'login' ? 'Iniciar sesion' : 'Crear cuenta'}
          </h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-950/50 border border-red-800 text-red-300 rounded-lg px-3 py-2 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
                minLength={3}
                className="w-full bg-[#0d1526] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                placeholder="Tu nombre de usuario"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Contrasena
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
                className="w-full bg-[#0d1526] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                placeholder="Tu contrasena"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Entrar' : 'Registrarse'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
              className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
            >
              {mode === 'login'
                ? 'No tienes cuenta? Registrate'
                : 'Ya tienes cuenta? Inicia sesion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
