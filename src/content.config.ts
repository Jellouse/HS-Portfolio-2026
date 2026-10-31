import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const frame = z.enum(['default', 'wide']);

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
    alt: z.string().default(''),
    frame: frame.default('default'),
    flush: z.boolean().default(false),
    outline: z.boolean().default(false),
  }),
});

const videoBlock = z.object({
  discriminant: z.literal('video'),
  value: z.object({
    src: z.string().nullish(),
    poster: z.string().nullish(),
    alt: z.string().nullish(),
    frame: frame.default('default'),
    flush: z.boolean().default(false),
    outline: z.boolean().default(false),
  }),
});

const pairBlock = z.object({
  discriminant: z.literal('pair'),
  value: z.object({
    layout: z.enum(['pair', 'stack']).default('pair'),
    left: z.string(),
    leftAlt: z.string().default(''),
    right: z.string(),
    rightAlt: z.string().default(''),
    frame: frame.default('default'),
    outline: z.boolean().default(false),
  }),
});

const processBlock = z.object({
  discriminant: z.literal('process'),
  value: z.object({
    images: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string().default(''),
          flush: z.boolean().default(false),
          outline: z.boolean().default(false),
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
  videoBlock,
]);

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
    caption: z.string().optional(),
    year: z.number().int().optional(),
    yearEnd: z.number().int().nullish(),
    published: z.boolean().default(true),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    summary: z.string(),
    cover: z.string().optional(),
    coverVideo: z.string().nullish(),
    coverAlt: z.string().optional(),
    coverFrame: frame.default('default'),
    coverFlush: z.boolean().default(false),
    coverOutline: z.boolean().default(false),
    rounded: z.boolean().default(true),
    info: z.array(infoSchema).default([]),
    processFromFolder: z.boolean().default(false),
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
    footerText: z.string(),
    footerName: z.string().default(''),
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

const projectOrder = defineCollection({
  loader: glob({
    pattern: 'project-order.yaml',
    base: './src/content/site',
  }),
  schema: z.object({
    projects: z.array(z.string()).default([]),
  }),
});

const products = defineCollection({
  loader: glob({
    pattern: '**/index.yaml',
    base: './src/content/products',
    generateId: ({ entry }) => entry.replace(/^\.\//, '').replace(/\/index\.ya?ml$/, ''),
  }),
  schema: z.object({
    name: z.string(),
    order: z.number().default(99),
    edition: z.string().optional(),
    dimensions: z.string().optional(),
    description: z.string(),

    seo: z.object({ title: z.string().optional(), description: z.string().optional() }).default({}),

    overview: z
      .object({
        show: z.boolean().default(true),
        title: z.string().optional(),
        description: z.string().optional(),
        left: z.object({ src: z.string().nullish(), alt: z.string().default(''), outline: z.boolean().default(false) }).optional(),
        right: z.object({ src: z.string().nullish(), alt: z.string().default(''), outline: z.boolean().default(false) }).optional(),
      })
      .default({ show: true }),

    detail: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        images: z.array(z.object({ src: z.string(), alt: z.string().default(''), outline: z.boolean().default(false) })).default([]),
        sections: z
          .array(z.object({ heading: z.string().default(''), text: z.string().default(''), image: z.object({ src: z.string().nullish(), alt: z.string().default(''), outline: z.boolean().default(false) }).optional() }))
          .default([]),
        wildTitle: z.string().optional(),
        wild: z.array(z.object({ src: z.string(), alt: z.string().default(''), outline: z.boolean().default(false) })).default([]),
        info: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
      })
      .default({}),
  }),
});

const serviceImage = z.object({
  src: z.string(),
  alt: z.string(),
  caption: z.string().default(''),
  href: z.string().default(''),
  tbd: z.boolean().default(false),
  poster: z.string().default(''),
});

const serviceSection = z.object({
  heading: z.string(),
  body: z.string(),
  images: z.array(serviceImage).default([]),
});

const serviceProcessStep = z.object({
  title: z.string(),
  body: z.string(),
});

const serviceFaq = z.object({
  question: z.string(),
  answer: z.string(),
});

const services = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/services' }),
  schema: z.object({
    title: z.string(),
    label: z.string().default(''),
    seoTitle: z.string().default(''),
    metaDescription: z.string().default(''),
    order: z.number().default(0),
    locationTag: z.string().default(''),
    h1: z.string().default(''),
    subline: z.string().default(''),
    intro: z.string().default(''),
    processHeading: z.string().default(''),
    processSteps: z.array(serviceProcessStep).default([]),
    sections: z.array(serviceSection).default([]),
    faq: z.array(serviceFaq).default([]),
    bottomCta: z.string().default(''),
    footerLine: z.string().default(''),
    summary: z.string().default(''),
    items: z.array(z.string()).default([]),
    projects: z.array(z.string()).default([]),
  }),
});

export const collections = { projects, site, projectOrder, products, services };
