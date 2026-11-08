import { getEntry } from 'astro:content';
import { getSite, renderInline } from './content';
import { imageHasAlpha } from './image-alpha';
import { resolveImage } from './images';

export type ArrowDir = 'left' | 'right' | 'up' | 'down';

export type ArrowSlide = { src: string; alt: string; title: string; caption: string; product: string; alpha: boolean };

export type ArrowNode = {
  id: string;
  parent: string;
  dir: ArrowDir;
  label: string;
  title: string;
  body: string;
  kind: 'branch' | 'gallery' | 'placeholder';
  slides: ArrowSlide[];
  paragraphs: string[];
};

export type ArrowTree = {
  landing: { title: string; body: string; hint: string };
  nodes: ArrowNode[];
};

export async function getArrowNav(): Promise<ArrowTree> {
  const entry = await getEntry('arrowNav', 'arrow-nav');
  if (!entry) throw new Error('Missing src/content/site/arrow-nav.yaml');
  const { landing, nodes } = entry.data;
  const site = await getSite();
  return {
    landing,
    nodes: await Promise.all(
      nodes.map(async (node) => ({
        id: node.id,
        parent: node.parent,
        dir: node.dir,
        label: node.label,
        title: node.title,
        body: node.body,
        kind: node.kind,
        paragraphs: node.id === 'about' ? site.about.map((paragraph) => renderInline(paragraph)) : [],
        slides: await Promise.all(
          node.groups.flatMap((group) =>
            group.images.map(async (image) => {
              const file = resolveImage(image.src);
              return {
                src: file.src,
                alt: image.alt,
                title: group.title,
                caption: group.caption,
                product: group.product,
                alpha: await imageHasAlpha(file),
              };
            }),
          ),
        ),
      })),
    ),
  };
}
