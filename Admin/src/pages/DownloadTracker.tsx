import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Package, Calendar, AlertCircle } from 'lucide-react';
import './DownloadTracker.css';

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  created_at: string;
}

interface GitHubRelease {
  id: number;
  name: string;
  tag_name: string;
  published_at: string;
  body: string;
  assets: ReleaseAsset[];
}

const DownloadTracker: React.FC = () => {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        const repoUrl = import.meta.env.VITE_GITHUB_REPO_URL || 'https://github.com/IsmailofficialGithub/Tracking_system';
        const apiPath = repoUrl.replace('github.com', 'api.github.com/repos') + '/releases';
        
        const response = await axios.get(apiPath);
        setReleases(response.data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch releases:', err);
        setError('Failed to load tracking app releases. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, []);

  const formatSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header" style={{ marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Download Tracker</h1>
          <p style={{ color: 'var(--text-muted)' }}>Download the latest and previous versions of the employee tracking app.</p>
        </div>
      </div>

      <div className="releases-list">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <p>Loading releases...</p>
          </div>
        ) : error ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
            <AlertCircle size={48} style={{ margin: '0 auto 16px auto' }} />
            <p>{error}</p>
          </div>
        ) : releases.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <Package size={48} style={{ margin: '0 auto 16px auto' }} />
            <p>No releases found for this repository.</p>
          </div>
        ) : (
          releases.map(release => {
            const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));
            
            return (
              <div key={release.id} className="glass-panel release-card" style={{ marginBottom: '20px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>{release.name || release.tag_name}</h2>
                    <div style={{ display: 'flex', gap: '15px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      <span style={{ background: 'var(--accent)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>{release.tag_name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} />
                        {formatDate(release.published_at)}
                      </span>
                    </div>
                  </div>
                  
                  {exeAsset ? (
                    <a 
                      href={exeAsset.browser_download_url} 
                      className="btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download size={18} />
                      Download ({formatSize(exeAsset.size)})
                    </a>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', padding: '10px 15px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px' }}>
                      <AlertCircle size={16} />
                      <span>No .exe found</span>
                    </div>
                  )}
                </div>
                
                {release.body && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '10px', color: 'var(--text-main)' }}>Release Notes</h3>
                    <div style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                      {release.body}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DownloadTracker;
