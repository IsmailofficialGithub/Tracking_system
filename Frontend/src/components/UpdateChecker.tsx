import { useState, useEffect } from 'react';
import axios from 'axios';
import semver from 'semver';
import { AlertCircle, Download, X, CheckCircle, Bug } from 'lucide-react';
import packageJson from '../../package.json';

const BACKEND_URL = (window as any).ENV?.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

interface VersionInfo {
  current_version: string;
  minimum_version: string;
  build_number: number;
  features: string[];
  bug_fixes: string[];
}

export function UpdateChecker() {
  const [updateInfo, setUpdateInfo] = useState<{
    isUpdateAvailable: boolean;
    isForced: boolean;
    features: string[];
    bug_fixes: string[];
    version: string;
    releasesUrl: string;
  } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        // 1. Fetch dynamic GitHub URL from backend
        const configRes = await axios.get(`${BACKEND_URL}/api/config/app-info`);
        const githubRepoUrl = configRes.data.github_repo_url; // e.g., https://github.com/IsmailofficialGithub/Tracking_system
        
        // Convert to raw URL for version.json
        const rawBaseUrl = githubRepoUrl.replace('github.com', 'raw.githubusercontent.com');
        const versionUrl = `${rawBaseUrl}/main/version.json`;
        const releasesUrl = `${githubRepoUrl}/releases`;

        // 2. Fetch version.json
        const res = await axios.get<VersionInfo>(`${versionUrl}?t=${Date.now()}`);
        const remoteVersion = res.data.current_version;
        const minVersion = res.data.minimum_version;
        const remoteBuildNumber = res.data.build_number || 0;
        
        const currentAppVersion = packageJson.version;
        const currentBuildNumber = (packageJson as any).buildNumber || 0;

        let isUpdateAvailable = false;
        let isForced = false;

        // Check forced update
        if (semver.lt(currentAppVersion, minVersion)) {
          isUpdateAvailable = true;
          isForced = true;
        } 
        // Check casual update (version bump OR build number bump)
        else if (
          semver.lt(currentAppVersion, remoteVersion) || 
          (semver.eq(currentAppVersion, remoteVersion) && currentBuildNumber < remoteBuildNumber)
        ) {
          isUpdateAvailable = true;
          isForced = false;
        }

        if (isUpdateAvailable) {
          setUpdateInfo({
            isUpdateAvailable: true,
            isForced,
            features: res.data.features || [],
            bug_fixes: res.data.bug_fixes || [],
            version: remoteVersion,
            releasesUrl,
          });
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    checkUpdate();
  }, []);

  const handleUpdate = () => {
    if (!updateInfo) return;
    // Open GitHub releases page in external browser
    if ((window as any).electronAPI?.openExternalUrl) {
      (window as any).electronAPI.openExternalUrl(updateInfo.releasesUrl);
    } else {
      window.open(updateInfo.releasesUrl, '_blank');
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  if (!updateInfo || isDismissed) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', position: 'relative', overflow: 'hidden' }}>
        {!updateInfo.isForced && (
          <button 
            onClick={handleDismiss}
            style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', color: updateInfo.isForced ? '#ef4444' : '#3b82f6' }}>
          <AlertCircle size={48} />
        </div>
        
        <h2 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '1.5rem', fontWeight: 'bold' }}>
          {updateInfo.isForced ? 'Mandatory Update Required' : 'Update Available'}
        </h2>
        
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.95rem' }}>
          Version {updateInfo.version} is now available.
          {updateInfo.isForced ? ' You must update to continue using ChronoTrack.' : ' We recommend updating for the best experience.'}
        </p>

        {/* Features & Bug Fixes UI */}
        {(updateInfo.features.length > 0 || updateInfo.bug_fixes.length > 0) && (
          <div style={{ 
            background: 'rgba(255,255,255,0.03)', 
            border: '1px solid rgba(255,255,255,0.05)',
            padding: '16px', 
            borderRadius: '12px', 
            marginBottom: '25px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {updateInfo.features.length > 0 && (
              <div style={{ marginBottom: updateInfo.bug_fixes.length > 0 ? '16px' : '0' }}>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '8px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} color="#10b981" /> New Features
                </h3>
                <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', listStyleType: 'disc' }}>
                  {updateInfo.features.map((feature, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}

            {updateInfo.bug_fixes.length > 0 && (
              <div>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '8px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bug size={14} color="#f59e0b" /> Bug Fixes
                </h3>
                <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', listStyleType: 'disc' }}>
                  {updateInfo.bug_fixes.map((fix, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{fix}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <button 
          onClick={handleUpdate}
          className="btn-primary" 
          style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '8px',
            background: updateInfo.isForced ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            boxShadow: updateInfo.isForced ? '0 4px 15px rgba(239,68,68,0.3)' : '0 4px 15px rgba(59,130,246,0.3)'
          }}
        >
          <Download size={18} />
          {updateInfo.isForced ? 'Update Now' : 'Download Update'}
        </button>
      </div>
    </div>
  );
}
