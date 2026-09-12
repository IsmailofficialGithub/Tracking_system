import { useState, useRef } from 'react';
import axios from 'axios';
import { Lock, Mail, Loader2, Play, Square, Pause, RefreshCw } from 'lucide-react';
import './index.css';

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
  const [isPaused, setIsPaused] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const startRecording = async () => {
    setError(null);
    try {
      // 1. MUST FIRST verify screen capture permission BEFORE check-in
      const sourceId = await (window as any).electronAPI.getScreenSource();
      if (!sourceId) {
        throw new Error("Screen sharing permission required. You must share your entire screen to check in.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minFrameRate: 1,
            maxFrameRate: 2,
            maxWidth: 1280,
            maxHeight: 720
          }
        } as any
      });

      // 2. Screen capture granted -> Now call Check In API
      const checkInRes = await axios.post(`${BACKEND_URL}/api/employee/check-in`, {}, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const newSessionId = checkInRes.data.session_id;
      setSessionId(newSessionId);

      // 3. Open Real-time WebSocket connection for Admin Live Presence
      const wsUrl = BACKEND_URL.replace('http', 'ws');
      const ws = new WebSocket(`${wsUrl}/api/realtime/ws?token=${sessionToken}`);
      ws.onopen = () => console.log("WebSocket connected for Real-time presence.");
      ws.onclose = () => console.log("WebSocket closed.");
      wsRef.current = ws;

      // 4. Start MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && newSessionId) {
          console.log("Uploading chunk of size:", e.data.size, "bytes");
          try {
            await axios.post(
              `${BACKEND_URL}/api/employee/recordings/upload/${newSessionId}`,
              e.data,
              {
                headers: {
                  'Authorization': `Bearer ${sessionToken}`,
                  'Content-Type': 'video/webm'
                }
              }
            );
          } catch (uploadError) {
            console.error("Failed to upload chunk", uploadError);
          }
        }
      };

      // Request a chunk every 2 minutes (120,000 ms)
      recorder.start(120000); 
      setIsRecording(true);
      setIsPaused(false);
    } catch (e: any) {
      console.error("Shift Start Error:", e);
      let errMsg = "Failed to start shift.";
      if (e.response?.data) {
        if (typeof e.response.data === 'string') {
          errMsg = e.response.data;
        } else if (typeof e.response.data === 'object') {
          errMsg = e.response.data.error || e.response.data.message || JSON.stringify(e.response.data);
        }
      } else if (e.message) {
        errMsg = e.message;
      }
      setError(errMsg);
    }
  };

  const togglePause = async () => {
    if (!mediaRecorderRef.current || !sessionId) return;
    try {
      if (isPaused) {
        await axios.post(`${BACKEND_URL}/api/employee/resume`, {}, {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } else {
        await axios.post(`${BACKEND_URL}/api/employee/pause`, {}, {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    } catch (err) {
      console.error("Failed to toggle pause state", err);
      setError("Failed to pause/resume tracking.");
    }
  };

  const stopRecording = async () => {
    setError(null);
    // Stop recording engine
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    
    // Close Real-time socket
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Check Out via API
    if (sessionId) {
      try {
        await axios.post(`${BACKEND_URL}/api/employee/check-out`, {}, {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
      } catch (e) {
        console.error("Failed to checkout", e);
      }
    }
    
    setIsRecording(false);
    setIsPaused(false);
    setSessionId(null);
  };

  return (
    <div className="glass-panel" style={{ width: '320px', textAlign: 'center' }}>
      <h2 style={{ marginBottom: '1rem' }}>
        {isRecording ? (isPaused ? '⏸️ Shift Paused' : '🟢 Tracking Active') : 'Dashboard'}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        {isRecording
          ? isPaused
            ? 'Tracking is paused. Click Resume to continue.'
            : 'Screen capture active and streaming.'
          : 'Entire screen share required to check in.'}
      </p>
      
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', textAlign: 'left' }}>
          ⚠️ {error}
        </div>
      )}

      {!isRecording ? (
        <button onClick={startRecording} className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <Play size={18} /> Start Shift
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={togglePause}
            className="btn-primary"
            style={{ backgroundColor: isPaused ? '#3b82f6' : '#f59e0b', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            {isPaused ? <RefreshCw size={18} /> : <Pause size={18} />}
            {isPaused ? 'Resume Shift' : 'Pause Shift'}
          </button>
          
          <button
            onClick={stopRecording}
            className="btn-primary"
            style={{ backgroundColor: '#ef4444', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            <Square size={18} /> End Shift
          </button>
        </div>
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
        `${BACKEND_URL}/api/auth/login`,
        { email, password },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      const token = res.data.token;
      setSessionToken(token);
      
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials.');
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
