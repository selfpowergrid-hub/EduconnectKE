import React, { useEffect, useRef, useState } from 'react';
import { processStudentPhoto } from '../../lib/imageProcessing';

// Avatar with initials fallback. Used inline for table thumbnails too.
export const StudentAvatar = ({ name, photoUrl, size = 40, fontSize }) => {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase() || '?';

  const colorSeed = initials.charCodeAt(0) + (initials.charCodeAt(1) || 0);
  const palette = ['#1B6B3A', '#1A5F9C', '#6C3483', '#D35400', '#B7791F', '#117864'];
  const bg = palette[colorSeed % palette.length];

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || 'Student'}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', border: '1.5px solid #fff',
          boxShadow: '0 0 0 1px #E8EAF0',
          flexShrink: 0, background: '#f5f2eb',
        }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      title={name || ''}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: fontSize || Math.round(size * 0.4),
        flexShrink: 0, letterSpacing: '0.02em',
        boxShadow: '0 0 0 1px #E8EAF0',
      }}
    >{initials}</div>
  );
};

// Picker + preview. Calls onChange(blob | null) — parent decides when/how to upload.
const PhotoUpload = ({ currentUrl, studentName, onChange, size = 96 }) => {
  const inputRef = useRef(null);
  const [localPreview, setLocalPreview] = useState(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      const blob = await processStudentPhoto(file);
      if (localPreview) URL.revokeObjectURL(localPreview);
      const url = URL.createObjectURL(blob);
      setLocalPreview(url);
      onChange?.(blob);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setError('');
    onChange?.(null, { removed: true });
  };

  const previewUrl = localPreview || currentUrl;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative' }}>
        <StudentAvatar
          photoUrl={previewUrl}
          name={studentName}
          size={size}
        />
        {isProcessing && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.4)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 700,
          }}>…</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
            style={{
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid #1B6B3A', background: '#fff',
              color: '#1B6B3A', fontSize: 12, fontWeight: 700,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            {previewUrl ? 'Change' : 'Choose Photo'}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isProcessing}
              style={{
                padding: '6px 12px', borderRadius: 6,
                border: '1px solid #e6dfd8', background: '#fff',
                color: '#C0392B', fontSize: 12, fontWeight: 700,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
              }}
            >Remove</button>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#8A8FA8' }}>
          Auto-cropped to a square and compressed to ~30 KB.
        </div>
        {error && (
          <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600 }}>{error}</div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePick}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default PhotoUpload;
