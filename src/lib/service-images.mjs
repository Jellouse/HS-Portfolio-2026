import { projectLabel } from './project-label.mjs';

const VIDEO = /\.(mp4|webm|mov)(?:$|\?)/i;
const WORK_HREF = /^\/work\/([^/]+)\/?$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Project slug from a service image: explicit project cover, or /work/<slug>/ link. */
export function projectSlugForServiceImage(image) {
  if (image?.discriminant === 'project') return text(image.value?.project);
  const match = text(image?.value?.href).match(WORK_HREF);
  return match?.[1] || '';
}

function captionFor(image, project) {
  const caption = image?.value?.caption || '';
  if (project && (!text(caption) || /\[year\]/.test(caption))) {
    return projectLabel(project);
  }
  return caption;
}

export function resolveServiceImage(image, project, where) {
  if (image?.discriminant === 'project') {
    const slug = text(image.value?.project);
    const cover = text(project?.cover);
    if (!slug || !cover) {
      throw new Error(`${where}: project ${slug || '(empty)'} has no cover`);
    }
    const video = text(image.value?.video);
    return {
      src: video || cover,
      poster: video ? cover : '',
      video: Boolean(video),
      alt: text(image.value?.alt) || text(project?.coverAlt),
      caption: captionFor(image, project),
      href: image.value?.href || '',
    };
  }

  const src = text(image?.value?.src);
  if (!src) throw new Error(`${where}: missing image`);
  const video = VIDEO.test(src);
  return {
    src,
    poster: '',
    video,
    alt: image.value?.alt || '',
    caption: captionFor(image, project),
    href: image.value?.href || '',
  };
}
