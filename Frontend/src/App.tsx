import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Lock, Mail, Loader2, Play, Square, Pause, RefreshCw, Minus, X, Maximize2 } from 'lucide-react';
import './index.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const toggleMiniMode = (mini: boolean) => {
    setIsMiniMode(mini);
    (window as any).electronAPI?.setMiniMode(mini);
  };

  const handleMinimize = () => {
    (window as any).electronAPI?.minimize();
  };
  const handleClose = () => {
    (window as any).electronAPI?.close();
  };

  if (isMiniMode) {
    return (
      <div style={{ height: '100vh', width: '100vw', background: 'transparent', padding: '10px' }}>
        <div className="mini-widget">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="live-dot" style={{ background: isPaused ? '#f59e0b' : 'var(--accent)' }} />
            <span className="timer-text">
              {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:
              {String(recordingDuration % 60).padStart(2, '0')}
            </span>
          </div>
          <button onClick={() => toggleMiniMode(false)} className="mini-widget-btn" title="Expand">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <div className="titlebar">
        <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)', letterSpacing: '0.5px' }}>ChronoTrack</div>
        <div style={{ display: 'flex', gap: '4px', WebkitAppRegion: 'no-drag' }}>
          <button onClick={handleMinimize} className="titlebar-btn">
            <Minus size={16} />
          </button>
          <button onClick={handleClose} className="titlebar-btn">
            <X size={16} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', paddingBottom: '40px' }}>
        {sessionToken 
          ? <Dashboard 
              sessionToken={sessionToken} 
              onLogout={() => setSessionToken(null)} 
              isRecording={isRecording}
              setIsRecording={setIsRecording}
              isPaused={isPaused}
              setIsPaused={setIsPaused}
              recordingDuration={recordingDuration}
              setRecordingDuration={setRecordingDuration}
              toggleMiniMode={toggleMiniMode}
            />
          : <Login setSessionToken={setSessionToken} />
        }
      </div>
    </div>
  );
}

interface DashboardProps {
  sessionToken: string;
  onLogout: () => void;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  isPaused: boolean;
  setIsPaused: (v: boolean) => void;
  recordingDuration: number;
  setRecordingDuration: (v: any) => void;
  toggleMiniMode: (v: boolean) => void;
}

function Dashboard({ sessionToken, onLogout, isRecording, setIsRecording, isPaused, setIsPaused, recordingDuration, setRecordingDuration, toggleMiniMode }: DashboardProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => setRecordingDuration((prev: number) => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
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

      // Request a chunk every 10 seconds (10,000 ms) for lower latency live streaming
      recorder.start(10000); 
      
      // Force an immediate chunk after 1 second so the backend gets the WebM header instantly.
      // This allows the Admin portal to start playing the video without waiting 10 seconds.
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
      }, 1000);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      
      // Auto-minimize after 2.5 seconds
      setTimeout(() => {
        toggleMiniMode(true);
      }, 2500);
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
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePause = async () => {
    if (!mediaRecorderRef.current || !sessionId || isProcessing) return;
    setIsProcessing(true);
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
    } finally {
      setIsProcessing(false);
    }
  };

  const stopRecording = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
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
    setIsProcessing(false);
  };

  const handleLogout = async () => {
    if (isProcessing) return;
    if (isRecording) {
      setError("Please end your active shift before logging out.");
      return;
    }
    onLogout();
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
        <button onClick={startRecording} disabled={isProcessing} className="btn-primary" style={{ marginTop: '1rem', opacity: isProcessing ? 0.7 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
          {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />} 
          {isProcessing ? 'Starting...' : 'Start Shift'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '1rem' }}>
          <button
            onClick={togglePause}
            disabled={isProcessing}
            className="btn-primary"
            style={{ 
              background: isPaused ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              boxShadow: isPaused ? '0 4px 15px rgba(16,185,129,0.3)' : '0 4px 15px rgba(245,158,11,0.3)',
              opacity: isProcessing ? 0.7 : 1,
              cursor: isProcessing ? 'not-allowed' : 'pointer'
            }}
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : (isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />)}
            {isProcessing ? 'Processing...' : (isPaused ? 'Resume Shift' : 'Pause Shift')}
          </button>
          
          <button
            onClick={stopRecording}
            disabled={isProcessing}
            className="btn-primary"
            style={{ 
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: '0 4px 15px rgba(239,68,68,0.3)',
              opacity: isProcessing ? 0.7 : 1,
              cursor: isProcessing ? 'not-allowed' : 'pointer'
            }}
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} fill="currentColor" />}
            {isProcessing ? 'Ending Shift...' : 'End Shift'}
          </button>
        </div>
      )}
      <button onClick={handleLogout} disabled={isProcessing} style={{ marginTop: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '0.8rem', textDecoration: 'underline', opacity: isProcessing ? 0.7 : 1 }}>
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
