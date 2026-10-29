import React from 'react';

import { useRef, useState, type ReactNode } from 'react';
import { isHevcRisk, uploadVideo } from './video-upload-client';
import { typePx } from './type-scale';

export function VideoUploadButton({ onDone }: { onDone: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const pick = async (file?: File) => {
    if (!file) return;
    setNote(
      isHevcRisk(file)
        ? 'This is a .mov (likely HEVC). It plays in Safari but not everywhere. Export as H.264 MP4 ("Most Compatible") if you can.'
        : '',
    );
    setProgress(0);
    try {
      const folder = location.pathname.match(/projects\/item\/([^/]+)/)?.[1] ?? 'misc';
      const url = await uploadVideo(file, folder, setProgress);
      onDone(url);
      setProgress(null);
    } catch (e) {
      setProgress(null);
      setNote((e as Error).message);
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <input ref={input} type="file" accept="video/mp4,video/webm,video/quicktime,.mov" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button
        type="button"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
        style={{ alignSelf: 'flex-start', font: 'inherit', padding: '8px 14px', borderRadius: 8, border: '1px solid #111', background: '#111', color: '#fff', cursor: 'pointer', opacity: progress !== null ? 0.5 : 1 }}
      >
        {progress === null ? 'Upload video' : `Uploading ${Math.round(progress * 100)}%`}
      </button>
      {progress !== null && (
        <div style={{ height: 4, background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: '#111', transition: 'width 120ms linear' }} />
        </div>
      )}
      {note && <p style={{ margin: 0, fontSize: typePx('text-meta'), color: '#8a5a00' }}>{note}</p>}
    </div>
  );
}

export function withUpload(Input: (props: any) => ReactNode) {
  return function VideoUrlInput(props: any) {
    return (
      <div>
        <Input {...props} />
        <VideoUploadButton onDone={(url) => props.onChange(url)} />
      </div>
    );
  };
}
