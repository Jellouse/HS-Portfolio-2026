const VIDEO = /\.(mp4|webm|mov)(?:$|\?)/i;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
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
      caption: image.value?.caption || '',
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
    caption: image.value?.caption || '',
    href: image.value?.href || '',
  };
}
