import React, { useState, useEffect, useRef } from 'react';

export const LiveVideoPlayer: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    let isActive = true;
    const fetchLatest = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        const res = await fetch(`${baseUrl}/admin/live/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok && isActive) {
          const text = await res.text();
          if (text.startsWith('data:image')) {
            setImageSrc(text);
          }
        }
      } catch (err) {
        console.error('Failed to fetch live view', err);
      }
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 3000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  return (
    <div ref={containerRef} style={{ background: '#000', borderRadius: isFullscreen ? '0' : '12px', overflow: 'hidden', minHeight: '360px', height: isFullscreen ? '100vh' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {!imageSrc ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 10, backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '1rem', color: 'white', fontWeight: 500 }}>Connecting to Live Feed...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          <img
            src={imageSrc}
            alt="Live Screen Feed"
            style={{ width: '100%', height: '100%', maxHeight: isFullscreen ? '100vh' : '420px', objectFit: 'contain' }}
          />
          <button 
            onClick={toggleFullscreen}
            style={{ position: 'absolute', bottom: '15px', right: '15px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', zIndex: 20, fontSize: '0.85rem' }}
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen ⛶'}
          </button>
        </>
      )}
    </div>
  );
};

export default LiveVideoPlayer;
