import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const frame = z.enum(['full', 'wide', 'medium', 'narrow']);

const textBlock = z.object({
  discriminant: z.literal('text'),
  value: z.object({
    heading: z.string().optional(),
    text: z.string(),
  }),
});

const imageBlock = z.object({
  discriminant: z.literal('image'),
  value: z.object({
    src: z.string(),
    alt: z.string(),
    frame: frame.default('full'),
  }),
});

const pairBlock = z.object({
  discriminant: z.literal('pair'),
  value: z.object({
    left: z.string(),
    leftAlt: z.string(),
    right: z.string(),
    rightAlt: z.string(),
  }),
});

const processBlock = z.object({
  discriminant: z.literal('process'),
  value: z.object({
    images: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string(),
        }),
      )
      .default([]),
  }),
});

export const blockSchema = z.discriminatedUnion('discriminant', [
  textBlock,
  imageBlock,
  pairBlock,
  processBlock,
]);

const creditSchema = z.object({
  role: z.string(),
  name: z.string(),
  url: z.string().optional(),
});

const infoSchema = z.object({
  label: z.string(),
  value: z.string(),
  href: z.string().optional(),
});

const projects = defineCollection({
  loader: glob({
    pattern: '**/index.yaml',
    base: './src/content/projects',
    generateId: ({ entry }) =>
      entry.replace(/^\.\//, '').replace(/\/index\.ya?ml$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    caption: z.string(),
    listCaption: z.string().optional(),
    year: z.number().int().optional(),
    order: z.number().int(),
    published: z.boolean().default(true),
    summary: z.string(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    coverFrame: frame.default('full'),
    rounded: z.boolean().default(true),
    credits: z.array(creditSchema).default([]),
    info: z.array(infoSchema).default([]),
    blocks: z.array(blockSchema).default([]),
    todo: z.array(z.string()).default([]),
  }),
});

const site = defineCollection({
  loader: glob({
    pattern: 'site.yaml',
    base: './src/content/site',
  }),
  schema: z.object({
    name: z.string(),
    studio: z.string(),
    email: z.string().email(),
    intro: z.string(),
    timezone: z.string(),
    place: z.string(),
    about: z.array(z.string()),
    socials: z
      .array(
        z.object({
          label: z.string(),
          href: z.string().optional(),
        }),
      )
      .default([]),
    todo: z.array(z.string()).default([]),
  }),
});

export const collections = { projects, site };
