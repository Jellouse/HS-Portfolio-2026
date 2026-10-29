import { CMS_REPO } from './cms-auth';

export function contentPathFromSrc(src: string): string {
  const cleaned = src.replace(/^\.\//, '').replace(/^\//, '');
  if (cleaned.startsWith('src/content/')) return cleaned;
  return `src/content/projects/${cleaned}`;
}

export function githubRawUrl(src: string, ref: string): string {
  const path = contentPathFromSrc(src);
  const refPath = ref.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${CMS_REPO}/${refPath}/${path}`;
}
