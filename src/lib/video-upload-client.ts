// Browser side of the R2 upload: get a presigned URL, then PUT the file with progress.
export function cmsToken() {
  const m = document.cookie.match(/(?:^|;\s*)keystatic-gh-access-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export function isHevcRisk(file: File) {
  return /\.mov$/i.test(file.name) || file.type === 'video/quicktime';
}

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export async function uploadVideo(file: File, folder: string, onProgress: (p: number) => void) {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`This video is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 200 MB, so please export it smaller.`);
  }
  const res = await fetch('/api/video-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cmsToken()}` },
    body: JSON.stringify({ name: file.name, type: file.type, folder, size: file.size }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload not allowed (${res.status})`);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.uploadUrl);
    xhr.setRequestHeader('content-type', data.contentType);
    xhr.setRequestHeader('cache-control', 'public, max-age=31536000, immutable');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed (network or CORS)'));
    xhr.send(file);
  });
  return data.publicUrl as string;
}
