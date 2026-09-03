import { useState, useRef } from 'react';
import axios from 'axios';
import { Lock, Mail, Loader2, Play, Square } from 'lucide-react';
import './index.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  if (sessionToken) {
    return <Dashboard sessionToken={sessionToken} onLogout={() => setSessionToken(null)} />;
  }

  return <Login setSessionToken={setSessionToken} />;
}

function Dashboard({ sessionToken, onLogout }: { sessionToken: string; onLogout: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    try {
      const sourceId = await (window as any).electronAPI.getScreenSource();
      if (!sourceId) throw new Error("Could not find screen source");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minFrameRate: 1,
            maxFrameRate: 2, // Ultra-low frame rate for efficiency
            maxWidth: 1280,
            maxHeight: 720
          }
        } as any
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          console.log("Recorded Video Chunk:", e.data.size, "bytes");
          // Phase 5 will upload this chunk to the backend
        }
      };

      // Request a chunk every 2 minutes (120,000 ms)
      recorder.start(120000); 
      setIsRecording(true);
    } catch (e) {
      console.error("Screen capture failed:", e);
      alert("Failed to start tracking. Please ensure screen permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  };

  return (
    <div className="glass-panel" style={{ width: '320px', textAlign: 'center' }}>
      <h2 style={{ marginBottom: '1rem' }}>{isRecording ? 'Tracking Active' : 'Dashboard'}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        {isRecording ? 'You are currently checked in and tracking.' : 'Ready to start your shift.'}
      </p>
      
      {!isRecording ? (
        <button onClick={startRecording} className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <Play size={18} /> Start Shift
        </button>
      ) : (
        <button onClick={stopRecording} className="btn-primary" style={{ backgroundColor: '#ef4444', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <Square size={18} /> End Shift
        </button>
      )}
      <button onClick={onLogout} style={{ marginTop: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>
        Log Out
      </button>
    </div>
  );
}

function Login({ setSessionToken }: { setSessionToken: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await axios.post(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        { email, password },
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Store token
      const token = res.data.access_token;
      setSessionToken(token);
      
    } catch (err: any) {
      setError(err.response?.data?.error_description || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ width: '320px' }}>
      <h2 style={{ marginBottom: '0.5rem', textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>Sign In</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
        Access your tracking dashboard
      </p>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div style={{ position: 'relative' }}>
          <Mail size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
          <input 
            type="email" 
            className="input-field" 
            placeholder="Employee Email"
            style={{ paddingLeft: '40px' }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required 
          />
        </div>
        <div style={{ position: 'relative' }}>
          <Lock size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
          <input 
            type="password" 
            className="input-field" 
            placeholder="Password"
            style={{ paddingLeft: '40px' }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required 
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', opacity: loading ? 0.7 : 1 }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

export default App;
