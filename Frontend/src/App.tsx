import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Lock, Mail, Loader2, Play, Square, Pause, Minus, X, Eye, EyeOff } from 'lucide-react';
import './index.css';
import { UpdateChecker } from './components/UpdateChecker';

const FALLBACK_BACKEND_URL = (window as any).ENV?.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL;

function App() {
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const remoteConfigUrl = 'https://raw.githubusercontent.com/IsmailofficialGithub/Tracking_system/main/frontend-config.json';
        const res = await axios.get(`${remoteConfigUrl}?t=${Date.now()}`);
        if (res.data && res.data.VITE_BACKEND_URL) {
          setBackendUrl(res.data.VITE_BACKEND_URL);
        } else {
          setBackendUrl(FALLBACK_BACKEND_URL);
        }
      } catch (err) {
        console.warn('Failed to fetch remote config, using local fallback.', err);
        setBackendUrl(FALLBACK_BACKEND_URL);
      }
    };
    fetchConfig();
  }, []);

  const handleMinimize = () => {
    (window as any).electronAPI?.minimize();
  };
  const handleClose = () => {
    (window as any).electronAPI?.close();
  };

  if (!backendUrl) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 className="animate-spin" size={32} color="var(--accent)" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <UpdateChecker />
      
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="./favicon.png" alt="Icon" style={{ width: '16px', height: '16px' }} />
            <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)', letterSpacing: '0.5px' }}>Axiomra Attendance</div>
          </div>
          <div style={{ display: 'flex', gap: '4px', WebkitAppRegion: 'no-drag' } as any}>
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
                backendUrl={backendUrl}
                sessionToken={sessionToken} 
                onLogout={() => setSessionToken(null)} 
                isRecording={isRecording}
                setIsRecording={setIsRecording}
                isPaused={isPaused}
                setIsPaused={setIsPaused}
                recordingDuration={recordingDuration}
                setRecordingDuration={setRecordingDuration}
              />
            : <Login setSessionToken={setSessionToken} backendUrl={backendUrl} />
          }
        </div>
      </div>
    </div>
  );
}

interface DashboardProps {
  backendUrl: string;
  sessionToken: string;
  onLogout: () => void;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  isPaused: boolean;
  setIsPaused: (v: boolean) => void;
  recordingDuration: number;
  setRecordingDuration: (v: any) => void;
}

function Dashboard({ backendUrl: BACKEND_URL, sessionToken, onLogout, isRecording, setIsRecording, isPaused, setIsPaused, setRecordingDuration }: DashboardProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interruptedSession, setInterruptedSession] = useState<{ id: string, status: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<any>(null);
  const recordIntervalRef = useRef<any>(null);

  useEffect(() => {
    // Check for interrupted/active session on load
    axios.get(`${BACKEND_URL}/api/employee/current-session`, {
      headers: { Authorization: `Bearer ${sessionToken}` }
    })
    .then(res => {
      if (res.data && res.data.session_id) {
        setInterruptedSession({ id: res.data.session_id, status: res.data.status });
      }
    })
    .catch(console.error);
  }, [BACKEND_URL, sessionToken]);

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
        throw new Error("Permission required to start your shift.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minFrameRate: 1,
            maxFrameRate: 3,
            maxWidth: 854,
            maxHeight: 480
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
      ws.onopen = () => {
        console.log("WebSocket connected for Real-time presence and live view.");
        
        // Ping every 30 seconds
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
        
        // Start Live View screenshot capture every 3 seconds
        const videoEl = document.createElement('video');
        videoEl.srcObject = stream;
        videoEl.play();
        const canvas = document.createElement('canvas');
        canvas.width = 854;
        canvas.height = 480;
        
        const liveViewInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN && videoEl.videoWidth > 0) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
              // Compress moderately (0.6 quality) for better visuals while keeping bandwidth reasonable
              const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
              ws.send(JSON.stringify({
                type: 'screenshot',
                data: dataUrl
              }));
            }
          }
        }, 1000); // 1 FPS

        ws.addEventListener('close', () => {
          clearInterval(pingInterval);
          clearInterval(liveViewInterval);
          videoEl.pause();
          videoEl.srcObject = null;
        });
      };
      ws.onclose = () => console.log("WebSocket closed.");
      wsRef.current = ws;

      // 4. Start MediaRecorder
      const recorder = new MediaRecorder(stream, { 
        mimeType: 'video/webm; codecs=vp9',
        videoBitsPerSecond: 100000 // 100 kbps to drastically reduce file sizes
      });
      mediaRecorderRef.current = recorder;

      // In-memory queue to store chunks when internet drops
      const pendingChunks: Blob[] = [];
      let isUploading = false;

      const processUploadQueue = async () => {
        if (isUploading) return;
        if (pendingChunks.length === 0) return;
        
        isUploading = true;

        // Thundering Herd Prevention: 
        // If we have a large backlog (e.g. > 5 chunks = 50+ seconds offline),
        // we add a random jitter delay before bursting to the server.
        if (pendingChunks.length > 5) {
          const jitter = Math.random() * 30000; // 0 to 30 seconds
          console.log(`Backlog detected. Adding jitter delay of ${Math.round(jitter/1000)}s before uploading...`);
          await new Promise(r => setTimeout(r, jitter));
        }

        while (pendingChunks.length > 0) {
          const chunk = pendingChunks[0];
          try {
            console.log(`Uploading queued chunk of size: ${chunk.size} bytes. (${pendingChunks.length} remaining)`);
            await axios.post(
              `${BACKEND_URL}/api/employee/recordings/upload/${newSessionId}`,
              chunk,
              {
                headers: {
                  'Authorization': `Bearer ${sessionToken}`,
                  'Content-Type': 'video/webm'
                },
                timeout: 10000 // 10s timeout so it fails quickly if still offline
              }
            );
            
            // Success! Remove the chunk from the queue.
            pendingChunks.shift();

            // Pacing: Wait 1 second between uploading chunks to prevent hammering the server
            if (pendingChunks.length > 0) {
              await new Promise(r => setTimeout(r, 1000));
            }
          } catch (uploadError) {
            console.error("Failed to upload chunk, internet may still be down. Keeping in queue.", uploadError);
            // Break the loop. We'll try again on the next 10-second chunk generation.
            break;
          }
        }

        isUploading = false;
      };

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && newSessionId) {
          pendingChunks.push(e.data);
          processUploadQueue();
        }
      };

      // Instead of starting with a timeslice, we will manually stop and start the 
      // recorder every 60 seconds (1 minute). This drastically reduces server load 
      // and guarantees independent playable WebM chunks.
      recorder.start();
      
      recordIntervalRef.current = setInterval(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          recorder.start();
        }
      }, 60000); // 60 seconds

      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      setInterruptedSession(null); // Clear interrupted state once successfully resumed
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
      setError("Failed to pause/resume attendance.");
    } finally {
      setIsProcessing(false);
    }
  };

  const stopRecording = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    // Stop recording chunks
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }

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
        {isRecording ? (isPaused ? '⏸️ Shift Paused' : '🟢 Attendance Active') : 'Dashboard'}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        {isRecording
          ? isPaused
            ? 'Attendance is paused. Click Resume to continue.'
            : 'Shift is active.'
          : interruptedSession
            ? 'Your shift was interrupted. Please resume.'
            : 'Ready to start your shift.'}
      </p>
      
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', textAlign: 'left' }}>
          ⚠️ {error}
        </div>
      )}

      {!isRecording ? (
        <button onClick={startRecording} disabled={isProcessing} className="btn-primary" style={{ marginTop: '1rem', opacity: isProcessing ? 0.7 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
          {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />} 
          {isProcessing ? 'Starting...' : (interruptedSession ? 'Resume Interrupted Shift' : 'Start Shift')}
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

function Login({ setSessionToken, backendUrl: BACKEND_URL }: { setSessionToken: (token: string) => void, backendUrl: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedEmail = localStorage.getItem('saved_email');
    const savedPassword = localStorage.getItem('saved_password');
    if (savedEmail) setEmail(savedEmail);
    if (savedPassword) setPassword(savedPassword);
  }, []);

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
      localStorage.setItem('saved_email', email);
      localStorage.setItem('saved_password', password);
      
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ width: '320px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', height: '60px', overflow: 'hidden', alignItems: 'center' }}>
        <img src="./logo.png" alt="Axiomra" style={{ width: '200px', height: 'auto', filter: 'invert(1) hue-rotate(180deg)' }} />
      </div>
      <h2 style={{ marginBottom: '0.5rem', textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>Sign In</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
        Access your attendance dashboard
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
            type={showPassword ? "text" : "password"} 
            className="input-field" 
            placeholder="Password"
            style={{ paddingLeft: '40px', paddingRight: '40px' }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required 
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            style={{ position: 'absolute', right: '12px', top: '14px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <button type="submit" className="btn-primary" disabled={loading} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', opacity: loading ? 0.7 : 1 }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

export default App;
