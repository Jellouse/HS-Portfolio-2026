

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
        if (image.src) srcs.push(image.src);
      }
    }
  }
  return srcs;
}

export function resolveProcessFolderForRender(processFromFolder, folderSrcs, blocks) {
  if (!processFromFolder || !folderSrcs?.length) return [];
  const inBlocks = new Set(collectBlockImageSrcs(blocks));
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
      const images = folder.length > 0 ? folder.map((src) => ({ src })) : v.images || [];
      for (const image of images) {
        if (image.src) srcs.push(image.src);
      }
    }
  }

  if (folder.length > 0 && !hasProcessBlock) {
    srcs.push(...folder);
  }

  return srcs;
}
