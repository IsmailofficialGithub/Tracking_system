import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Package, Calendar, AlertCircle, Terminal, Shield, Laptop } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'downloads' | 'guide'>('downloads');

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
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="tracker-page fade-in">
      <div className="tracker-header">
        <div className="header-content">
          <div className="icon-box">
            <Download size={28} className="icon-gradient" />
          </div>
          <div className="header-text">
            <h1>Tracker Distribution Center</h1>
            <p>Deploy, manage, and download the Exiomra Employee Tracking agent.</p>
          </div>
        </div>
      </div>

      <div className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`}
          onClick={() => setActiveTab('downloads')}
        >
          <Package size={18} />
          Available Releases
        </button>
        <button 
          className={`tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveTab('guide')}
        >
          <Terminal size={18} />
          Deployment Guide
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'downloads' && (
          <div className="releases-grid">
            {loading ? (
              <div className="state-card loading-state">
                <div className="spinner-modern"></div>
                <p>Syncing with GitHub Releases...</p>
              </div>
            ) : error ? (
              <div className="state-card error-state">
                <AlertCircle size={40} className="error-icon" />
                <h3>Sync Failed</h3>
                <p>{error}</p>
              </div>
            ) : releases.length === 0 ? (
              <div className="state-card empty-state">
                <Package size={40} className="empty-icon" />
                <h3>No Releases Found</h3>
                <p>The repository does not currently have any published releases.</p>
              </div>
            ) : (
              releases.map((release, index) => {
                const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));
                const isLatest = index === 0;
                
                return (
                  <div key={release.id} className={`release-card-modern ${isLatest ? 'latest-release' : ''}`}>
                    {isLatest && <div className="latest-badge">Latest Stable</div>}
                    
                    <div className="release-card-header">
                      <div className="release-title-group">
                        <h2>{release.name || release.tag_name}</h2>
                        <div className="release-badges">
                          <span className="version-badge">{release.tag_name}</span>
                          <span className="date-badge">
                            <Calendar size={14} />
                            {formatDate(release.published_at)}
                          </span>
                        </div>
                      </div>
                      
                      {exeAsset ? (
                        <a 
                          href={exeAsset.browser_download_url} 
                          className="btn-download-premium"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="btn-icon">
                            <Download size={18} />
                          </div>
                          <div className="btn-text">
                            <span className="btn-title">Download for Windows</span>
                            <span className="btn-subtitle">Executable • {formatSize(exeAsset.size)}</span>
                          </div>
                        </a>
                      ) : (
                        <div className="missing-asset-badge">
                          <AlertCircle size={16} />
                          <span>No installer available</span>
                        </div>
                      )}
                    </div>
                    
                    {release.body && (
                      <details className="release-notes-modern">
                        <summary className="notes-title">What's New</summary>
                        <div className="notes-content-modern">
                          {release.body.split('\n').map((line, i) => {
                            if (!line.trim()) return null;
                            return (
                              <div key={i} className="note-line">
                                <span className="note-bullet">•</span>
                                <span>{line.replace(/^[-*]\s*/, '')}</span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="guide-container">
            <div className="guide-intro">
              <h2>Deployment & Installation Guide</h2>
              <p>Everything you need to successfully deploy the tracking agent to employee machines.</p>
            </div>

            <div className="guide-grid">
              <div className="guide-card">
                <div className="guide-card-icon user-icon">
                  <Laptop size={24} />
                </div>
                <h3>Standard User Installation</h3>
                <ol className="guide-steps">
                  <li>
                    <div className="step-title">Download the latest release</div>
                    <p>Navigate to the Downloads tab and fetch the latest Windows executable.</p>
                  </li>
                  <li>
                    <div className="step-title">Run the Installer</div>
                    <p>Double-click the downloaded <code>.exe</code> file.</p>
                  </li>
                  <li>
                    <div className="step-title">Bypass Windows SmartScreen</div>
                    <p>If prompted by Windows Protect, click <strong>"More info"</strong> and then <strong>"Run anyway"</strong>.</p>
                  </li>
                  <li>
                    <div className="step-title">Authenticate</div>
                    <p>Upon launch, log in using the credentials provided by the IT administrator.</p>
                  </li>
                </ol>
              </div>


              <div className="guide-card full-width">
                <div className="guide-card-icon security-icon">
                  <Shield size={24} />
                </div>
                <h3>Security & Privacy Posture</h3>
                <p>The Exiomra Tracking System is designed with strict privacy boundaries.</p>
                <div className="security-grid">
                  <div className="security-item">
                    <h4>Shift-Bound Tracking</h4>
                    <p>Screen recording and activity monitoring are explicitly restricted to active shift hours. No data is collected when off-duty.</p>
                  </div>
                  <div className="security-item">
                    <h4>In-App Updates</h4>
                    <p>The agent will automatically ping the distribution center and silently patch itself when new updates are deployed.</p>
                  </div>
                  <div className="security-item">
                    <h4>Data Encryption</h4>
                    <p>All video feeds and keystroke analytics are TLS-encrypted in transit to the secure backend.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadTracker;
