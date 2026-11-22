

const VIDEO_SRC = /\.(mp4|webm|mov)(?:$|[?#])/i;

export function isVideoSrc(src) {
  return typeof src === 'string' && VIDEO_SRC.test(src.trim());
}

export function isProcessVideo(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.video === 'string' && item.video.trim()) return true;
  return isVideoSrc(item.src);
}

export function processVideoSrc(item) {
  if (!item || typeof item !== 'object') return '';
  if (typeof item.video === 'string' && item.video.trim()) return item.video.trim();
  if (isVideoSrc(item.src)) return item.src.trim();
  return '';
}

export function processVideoPoster(item) {
  if (!item || typeof item !== 'object') return '';
  if (typeof item.poster === 'string' && item.poster.trim() && !isVideoSrc(item.poster)) {
    return item.poster.trim();
  }
  if (typeof item.src === 'string' && item.src.trim() && !isVideoSrc(item.src)) {
    return item.src.trim();
  }
  return '';
}

function localImageSrc(value) {
  if (typeof value !== 'string') return '';
  const src = value.trim();
  if (!src || isVideoSrc(src) || /^https?:\/\//i.test(src)) return '';
  return src;
}

export function processItemsForRender(blockItems = [], folder = [], useFolder = false) {
  const items = (blockItems || []).filter((item) => isProcessVideo(item) || localImageSrc(item?.src));
  if (!useFolder) return items;
  const videos = items.filter(isProcessVideo);
  return [...folder, ...videos];
}

export function collectBlockImageSrcs(blocks) {
  const srcs = [];
  for (const block of blocks || []) {
    const d = block.discriminant;
    const v = block.value || {};
    if (d === 'image' && v.src) srcs.push(v.src);
    else if (d === 'pair') {
      if (v.left) srcs.push(v.left);
      if (v.right) srcs.push(v.right);
    } else if (d === 'process') {
      for (const image of v.images || []) {
        const src = localImageSrc(image.src);
        const poster = localImageSrc(image.poster);
        if (src) srcs.push(src);
        if (poster && poster !== src) srcs.push(poster);
      }
    }
  }
  return srcs;
}

function blockSrcsOutsideProcess(blocks) {
  const srcs = [];
  for (const block of blocks || []) {
    const d = block.discriminant;
    const v = block.value || {};
    if (d === 'image' && v.src) srcs.push(v.src);
    else if (d === 'pair') {
      if (v.left) srcs.push(v.left);
      if (v.right) srcs.push(v.right);
    }
  }
  return srcs;
}

export function resolveProcessFolderForRender(processFromFolder, folderSrcs, blocks) {
  if (!processFromFolder || !folderSrcs?.length) return [];
  const inBlocks = new Set(blockSrcsOutsideProcess(blocks));
  return folderSrcs.filter((src) => !inBlocks.has(src));
}

export function planArticleImageSrcs(blocks, options = {}) {
  const processFromFolder = Boolean(options.processFromFolder);
  const folder = resolveProcessFolderForRender(
    processFromFolder,
    options.folderSrcs ?? [],
    blocks,
  );
  const hasProcessBlock = (blocks || []).some((b) => b.discriminant === 'process');
  const srcs = [];

  for (const block of blocks || []) {
    const d = block.discriminant;
    const v = block.value || {};
    if (d === 'image' && v.src) {
      srcs.push(v.src);
    } else if (d === 'pair') {
      if (v.left) srcs.push(v.left);
      if (v.right) srcs.push(v.right);
    } else if (d === 'process') {
      const items = processItemsForRender(
        v.images || [],
        folder.map((src) => ({ src })),
        folder.length > 0,
      );
      for (const item of items) {
        const src = localImageSrc(item.src);
        if (src) srcs.push(src);
      }
    }
  }

  if (folder.length > 0 && !hasProcessBlock) {
    srcs.push(...folder);
  }

  return srcs;
}
