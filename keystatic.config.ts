import { withUpload } from './src/lib/VideoUrlInput';
import { galleryCategories } from './src/lib/gallery-categories';
import { withImageCms } from './src/lib/image-field-cms';
import { config, fields, collection, singleton } from '@keystatic/core';

const repo = 'Jellouse/HS-Portfolio-2026';

function storage() {
  const selected = import.meta.env.KEYSTATIC_STORAGE;
  if (selected === 'local') return { kind: 'local' as const };
  if (selected === 'github' || import.meta.env.PROD) {
    return { kind: 'github' as const, repo };
  }
  return { kind: 'local' as const };
}

const imageDirectory = 'src/content/projects';
const imagePublicPath = '/src/content/projects';

const inlineLink = {
  bold: false,
  italic: false,
  strikethrough: false,
  code: false,
  heading: false,
  blockquote: false,
  orderedList: false,
  unorderedList: false,
  table: false,
  divider: false,
  codeBlock: false,
  image: false,
  link: true,
} as const;

function gallerySelect() {
  return fields.select({
    label: 'Gallery',
    description:
      'Include this in a homepage gallery. The project title and summary are the headline and caption.',
    options: [{ label: 'Not in a gallery', value: 'none' }, ...galleryCategories],
    defaultValue: 'none',
  });
}

const frame = fields.select({
  label: 'Frame',
  description: 'Desktop width. Default: the 6 text columns. Wide: one column more on each side (8 columns).',
  options: [
    { label: 'Default', value: 'default' },
    { label: 'Wide', value: 'wide' },
  ],
  defaultValue: 'default',
});

function videoField(label: string, description?: string) {
  const field = fields.text({
    label,
    description: [description, 'Upload with the button, or paste a URL.'].filter(Boolean).join(' '),
  });
  return { ...field, Input: withUpload(field.Input as any) };
}

const outline = fields.checkbox({
  label: 'Outline',
  defaultValue: false,
  description: '1px light grey line inside the image edge. Does not change the size.',
});

const serviceImageDirectory = 'src/content/services/images';
const serviceImagePublicPath = '/src/content/services/images';

function imageField(
  label: string,
  opts?: { required?: boolean; description?: string; directory?: string; publicPath?: string },
) {
  const field = fields.image({
    label,
    directory: opts?.directory ?? imageDirectory,
    publicPath: opts?.publicPath ?? imagePublicPath,
    ...(opts?.description ? { description: opts.description } : {}),
    ...(opts?.required ? { validation: { isRequired: true as const } } : {}),
  });

  return { ...field, Input: withImageCms(field.Input as any) };
}

function galleryImageField() {
  const field = imageField('Image', {
    required: true,
    directory: 'src/content',
    publicPath: '/src/content',
    description: 'Upload a photo. A project or product image already in the repo stays linked.',
  });
  const serialize = (field as { serialize?: (value: any, args: any) => any }).serialize;
  return {
    ...field,
    serialize(value: { filename: string; data: Uint8Array } | null, args: unknown) {
      if (value?.filename.includes('/')) {
        return {
          value: `/src/content/${value.filename}`,
          asset: { filename: value.filename, content: value.data },
        };
      }
      return serialize?.(value, args);
    },
  };
}

export default config({
  storage: storage(),
  ui: {
    brand: { name: 'Humansize' },
    navigation: ['projects', 'projectOrder', 'services', '---', 'products', '---', 'site', 'arrowNav'],
  },
  collections: {
    projects: collection({
      label: 'Projects',
      slugField: 'title',
      path: 'src/content/projects/*/',
      format: { data: 'yaml' },
      columns: ['title', 'year', 'published'],

      previewUrl: '/preview/{slug}/?branch={branch}',
      schema: {
        title: fields.slug({
          name: {
            label: 'Title',
            validation: { isRequired: true, length: { min: 1 } },
          },
        }),
        year: fields.integer({ label: 'Year' }),
        yearEnd: fields.integer({ label: 'End year', description: 'Leave empty for ongoing' }),
        published: fields.checkbox({
          label: 'Published',
          defaultValue: true,
          description: 'Unpublished projects stay in the repo and off the site.',
        }),
        seoTitle: fields.text({
          label: 'SEO title',
          description: 'Optional browser and search title; " · Humansize" is added. Empty uses the title and years.',
        }),
        seoDescription: fields.text({
          label: 'SEO description',
          multiline: true,
          description: 'Optional meta description for search. Empty uses the summary.',
        }),
        summary: fields.text({
          label: 'Summary',
          multiline: true,
          description: 'Two or three sentences shown under the title on the project page. A link is [label](https://...).',
          validation: { isRequired: true, length: { min: 1 } },
        }),
        cover: imageField('Cover', {
          required: true,
          description:
            'Required for the homepage card. Also used as the poster when a cover video is set. (The build allows cover video alone, but Keystatic cannot express that OR rule.)',
        }),
        coverGallery: gallerySelect(),
        coverVideo: videoField(
          'Cover video',
          'Optional mp4 or webm. Plays muted on a loop instead of the cover image, which becomes the poster. Keep it short; H.264 MP4 plays everywhere.',
        ),
        coverVideoGallery: gallerySelect(),
        coverAlt: fields.text({
          label: 'Cover alt text',
          description: 'Required. Alt for the cover image, or the accessible label for a cover video.',
          validation: { isRequired: true, length: { min: 1 } },
        }),
        coverFrame: frame,
        coverFlush: fields.checkbox({
          label: 'Flush cover',
          defaultValue: false,
          description:
            'White or transparent edges. The homepage image has no rounded corners and no padding.',
        }),
        coverOutline: fields.checkbox({
          label: 'Outline cover',
          defaultValue: false,
          description: '1px light grey line inside the cover image edge. Does not change the size.',
        }),
        rounded: fields.checkbox({
          label: 'Rounded image',
          defaultValue: true,
          description: 'Turn off for a square frame with a little padding.',
        }),
        info: fields.array(
          fields.object({
            label: fields.text({
              label: 'Key',
              validation: { isRequired: true, length: { min: 1 } },
            }),
            value: fields.text({
              label: 'Value',
              validation: { isRequired: true, length: { min: 1 } },
            }),
            href: fields.text({
              label: 'Link',
              description: 'Optional. The value is underlined.',
            }),
          }),
          {
            label: 'Info',
            description: 'Shown as Key: Value under a centred Info label. Leave out anything unknown.',
            itemLabel: (props) => props.fields.label.value || 'Line',
          },
        ),
        processFromFolder: fields.checkbox({
          label: 'Use process folder',
          defaultValue: false,
          description:
            'Show every image in this project\'s process/ folder, sorted by file name. Upload many at once at /keystatic-upload. If the folder is empty, the Process photos below are used.',
        }),
        blocks: fields.blocks(
          {
            text: {
              label: 'Text',
              schema: fields.object({
                heading: fields.text({
                  label: 'Title',
                  description: 'Optional. Shown centred above the text, like the case title. With a title the text is set larger.',
                }),
                text: fields.text({
                  label: 'Text',
                  multiline: true,
                  description: 'A link is [label](https://...).',
                  validation: { isRequired: true, length: { min: 1 } },
                }),
              }),
            },
            image: {
              label: 'Image',
              schema: fields.object({
                src: imageField('Image', { required: true }),
                alt: fields.text({
                  label: 'Alt text',
                  description: 'Optional. Empty is allowed; fill it when the image needs a description.',
                }),
                gallery: gallerySelect(),
                frame,
                flush: fields.checkbox({
                  label: 'Flush',
                  defaultValue: false,
                  description:
                    'White or transparent edges. No rounded corners and no padding.',
                }),
                outline,
              }),
            },
            video: {
              label: 'Video',
              schema: fields.object({
                src: videoField('Video', 'mp4 or webm. Plays muted on a loop. Keep it short; H.264 MP4 plays everywhere.'),
                poster: imageField('Poster'),
                alt: fields.text({ label: 'Label', description: 'Optional description of the video.' }),
                gallery: gallerySelect(),
                frame,
                flush: fields.checkbox({
                  label: 'Flush',
                  defaultValue: false,
                  description:
                    'White or transparent edges. No rounded corners and no padding.',
                }),
                outline,
              }),
            },
            pair: {
              label: 'Image pair',
              schema: fields.object({
                layout: fields.select({
                  label: 'Layout',
                  description:
                    'Stacked shows each photo as a normal full-width image block (same look and spacing as separate Image blocks). Keystatic cannot replace one block with two in the list, so this is the supported way to un-pair.',
                  options: [
                    { label: 'Side by side', value: 'pair' },
                    { label: 'Stacked like two image blocks', value: 'stack' },
                  ],
                  defaultValue: 'pair',
                }),
                left: imageField('Left image', { required: true }),
                leftAlt: fields.text({
                  label: 'Left alt text',
                  description: 'Optional.',
                }),
                leftGallery: gallerySelect(),
                right: imageField('Right image', { required: true }),
                rightAlt: fields.text({
                  label: 'Right alt text',
                  description: 'Optional.',
                }),
                rightGallery: gallerySelect(),
                frame,
                outline,
              }),
            },
            process: {
              label: 'Process',
              schema: fields.object({
                images: fields.array(
                  fields.object({
                    src: imageField('Image', { required: true }),
                    alt: fields.text({
                      label: 'Alt text',
                      description: 'Optional.',
                    }),
                    gallery: gallerySelect(),
                    flush: fields.checkbox({
                      label: 'Flush',
                      defaultValue: false,
                      description:
                        'White or transparent edges. No rounded corners and no padding.',
                    }),
                    outline,
                  }),
                  {
                    label: 'Photos',
                    description:
                      'When the process folder is on, the page uses that folder. A Gallery choice here still includes the photo.',
                    itemLabel: (props) => props.fields.alt.value || 'Photo',
                  },
                ),
              }),
            },
          },
          { label: 'Blocks' },
        ),
      },
    }),
    products: collection({
      label: 'Shop products',
      slugField: 'name',
      path: 'src/content/products/*/',
      format: { data: 'yaml' },
      columns: ['name'],
      schema: {
        name: fields.slug({
          name: { label: 'Name', validation: { isRequired: true, length: { min: 1 } } },
          slug: { label: 'Slug', description: 'Also the /shop/<slug> URL and the product key in /admin.' },
        }),
        order: fields.integer({ label: 'Order', description: 'Position on /shop, low first.', defaultValue: 99 }),
        edition: fields.text({ label: 'Edition', description: 'e.g. of 8' }),
        dimensions: fields.text({ label: 'Dimensions', description: 'Optional, e.g. 200 mm tall' }),
        description: fields.text({ label: 'Description', multiline: true, validation: { isRequired: true, length: { min: 1 } } }),
        seo: fields.object(
          {
            title: fields.text({ label: 'Search title', description: 'Browser and search title. Empty: name · Industrial Bloom · Humansize.' }),
            description: fields.text({ label: 'Meta description', multiline: true, description: 'Search snippet. Empty: the description.' }),
          },
          { label: 'SEO' },
        ),
        overview: fields.object(
          {
            show: fields.checkbox({ label: 'Show on /shop', defaultValue: true }),
            title: fields.text({ label: 'Title', description: 'As shown on /shop, e.g. Type-660. Empty: the name.' }),
            description: fields.text({ label: 'Description', description: 'Optional line under the caption.', multiline: true }),
            left: fields.object({
              src: { ...fields.image({ label: 'Image', directory: 'src/content/products', publicPath: '/src/content/products' }) },
              alt: fields.text({ label: 'Alt text' }), outline,
            }, { label: 'Left image' }),
            right: fields.object({
              src: { ...fields.image({ label: 'Image', directory: 'src/content/products', publicPath: '/src/content/products' }) },
              alt: fields.text({ label: 'Alt text' }), outline,
            }, { label: 'Right image' }),
          },
          { label: '/shop overview', description: 'The product section on /shop: an image pair and its caption.' },
        ),
        detail: fields.object(
          {
            title: fields.text({ label: 'Title', description: 'e.g. Type-660. Empty: the name.' }),
            description: fields.text({ label: 'Intro', multiline: true, description: 'Empty: the description above.' }),
            images: fields.array(
              fields.object({ src: { ...fields.image({ label: 'Image', directory: 'src/content/products', publicPath: '/src/content/products', validation: { isRequired: true } }) }, alt: fields.text({ label: 'Alt text' }), outline }),
              { label: 'Top images', description: 'Big images at the top of the detail page.', itemLabel: (props) => props.fields.alt.value || 'Image' },
            ),
            sections: fields.array(
              fields.object({
                heading: fields.text({ label: 'Heading' }),
                text: fields.text({ label: 'Text', multiline: true }),
                image: fields.object({ src: { ...fields.image({ label: 'Image', directory: 'src/content/products', publicPath: '/src/content/products' }) }, alt: fields.text({ label: 'Alt text' }), outline }, { label: 'Image' }),
              }),
              { label: 'Sections', description: 'Centred heading, text, one image.', itemLabel: (props) => props.fields.heading.value || 'Section' },
            ),
            wildTitle: fields.text({ label: 'Gallery heading', description: 'e.g. In the wild' }),
            wild: fields.array(
              fields.object({ src: { ...fields.image({ label: 'Image', directory: 'src/content/products', publicPath: '/src/content/products', validation: { isRequired: true } }) }, alt: fields.text({ label: 'Alt text' }), outline }),
              { label: 'Gallery images', description: 'Two columns, in reading order.', itemLabel: (props) => props.fields.alt.value || 'Image' },
            ),
            info: fields.array(
              fields.object({ label: fields.text({ label: 'Label' }), value: fields.text({ label: 'Value' }) }),
              { label: 'Info rows', description: 'Price and Shipping are added after these automatically.', itemLabel: (props) => props.fields.label.value || 'Row' },
            ),
          },
          { label: 'Detail page', description: 'The /shop/<slug> page.' },
        ),
      },
    }),
    services: collection({
      label: 'Services',
      slugField: 'title',
      path: 'src/content/services/*',
      format: { data: 'yaml' },
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        label: fields.text({ label: 'Label' }),
        seoTitle: fields.text({ label: 'SEO title' }),
        metaDescription: fields.text({ label: 'Meta description', multiline: true }),
        order: fields.integer({ label: 'Order', description: 'Position on /services.', defaultValue: 0 }),
        locationTag: fields.text({ label: 'Location tag', description: 'Shown on /services landing.' }),
        h1: fields.text({ label: 'H1' }),
        subline: fields.text({ label: 'Subline', multiline: true }),
        intro: fields.text({ label: 'Intro', multiline: true }),
        processHeading: fields.text({ label: 'Process heading', defaultValue: 'How a project runs' }),
        processSteps: fields.array(
          fields.object({
            title: fields.text({ label: 'Step title' }),
            body: fields.text({ label: 'Step body', multiline: true }),
          }),
          { label: 'Process steps', itemLabel: (p) => p.fields.title.value || 'Step' },
        ),
        sections: fields.array(
          fields.object({
            heading: fields.text({ label: 'Heading' }),
            body: fields.text({ label: 'Body', multiline: true }),
            images: fields.blocks(
              {
                project: {
                  label: 'Project cover',
                  itemLabel: (props) => props.fields.project.value || props.fields.caption.value || 'Project cover',
                  schema: fields.object({
                    project: fields.relationship({
                      label: 'Project',
                      collection: 'projects',
                      validation: { isRequired: true },
                    }),
                    alt: fields.text({
                      label: 'Alt text',
                      description: 'Empty uses the project cover alt.',
                    }),
                    caption: fields.text({ label: 'Caption' }),
                    href: fields.text({ label: 'Link' }),
                    video: videoField('Video', 'Optional. The project cover is the poster.'),
                    tbd: fields.checkbox({ label: 'Flag TBD', defaultValue: false }),
                  }),
                },
                image: {
                  label: 'Image',
                  itemLabel: (props) => props.fields.caption.value || props.fields.alt.value || 'Image',
                  schema: fields.object({
                    src: imageField('Image', {
                      required: true,
                      directory: serviceImageDirectory,
                      publicPath: serviceImagePublicPath,
                      description: 'Stored with this service.',
                    }),
                    alt: fields.text({ label: 'Alt text' }),
                    caption: fields.text({ label: 'Caption' }),
                    href: fields.text({ label: 'Link' }),
                    tbd: fields.checkbox({ label: 'Flag TBD', defaultValue: false }),
                  }),
                },
              },
              {
                label: 'Images',
                description:
                  'A project cover uses the cover from that project. An image is a file stored with this service.',
              },
            ),
          }),
          { label: 'Sections', itemLabel: (p) => p.fields.heading.value || 'Section' },
        ),
        faq: fields.array(
          fields.object({
            question: fields.text({ label: 'Question' }),
            answer: fields.text({ label: 'Answer', multiline: true }),
          }),
          { label: 'FAQ', itemLabel: (p) => p.fields.question.value || 'Question' },
        ),
        bottomCta: fields.text({ label: 'Bottom CTA', multiline: true }),
        footerLine: fields.text({ label: 'Footer line', multiline: true }),
        summary: fields.text({ label: 'Summary', multiline: true }),
        items: fields.array(fields.text({ label: 'Item' }), { label: 'Items', itemLabel: (p) => p.value }),
        projects: fields.array(fields.relationship({ label: 'Project', collection: 'projects' }), {
          label: 'Case studies',
          itemLabel: (p) => p.value ?? 'Select a project',
        }),
      },
    }),
  },
  singletons: {
    projectOrder: singleton({
      label: 'Project order',
      path: 'src/content/site/project-order',
      format: { data: 'yaml' },
      schema: {
        projects: fields.array(
          fields.relationship({
            label: 'Project',
            collection: 'projects',
            validation: { isRequired: true },
          }),
          {
            label: 'Projects',
            description:
              'Drag to set the order of published projects. Projects not in this list still appear, at the end (newer year first).',
            itemLabel: (props) => props.value ?? 'Select a project',
          },
        ),
      },
    }),
    site: singleton({
      label: 'Site',
      path: 'src/content/site/site',
      format: { data: 'yaml' },
      schema: {
        name: fields.text({
          label: 'Name',
          validation: { isRequired: true, length: { min: 1 } },
        }),
        studio: fields.text({
          label: 'Studio',
          validation: { isRequired: true, length: { min: 1 } },
        }),
        email: fields.text({
          label: 'Email',
          validation: {
            isRequired: true,
            length: { min: 1 },
            pattern: {
              regex: /.+@.+\..+/,
              message: 'Use a valid email address.',
            },
          },
        }),
        intro: fields.markdoc.inline({
          label: 'Intro',
          description:
            'Page description for search and sharing. Use the link mark for a name that has a project page, such as /work/atomic. Required by the build; markdoc fields cannot set isRequired.',
          options: inlineLink,
        }),
        footerText: fields.markdoc.inline({
          label: 'Footer text',
          description: 'The paragraph at the top of the footer. Use the link mark for a name that has a project page.',
          options: inlineLink,
        }),
        footerName: fields.text({
          label: 'Footer name',
          description: 'The line under the email in the footer, e.g. Humansize. Empty hides it.',
        }),
        about: fields.array(
          fields.markdoc.inline({
            label: 'Paragraph',
            description:
              'Use the link mark for a name that has a project page; link to #contact to open the contact form. Leave other names as text. Markdoc fields cannot set isRequired.',
            options: inlineLink,
          }),
          {
            label: 'About',
          },
        ),
        socials: fields.array(
          fields.object({
            label: fields.text({
              label: 'Label',
              validation: { isRequired: true, length: { min: 1 } },
            }),
            href: fields.text({ label: 'URL' }),
          }),
          { label: 'Socials', itemLabel: (props) => props.fields.label.value || 'Link' },
        ),
        todo: fields.array(fields.text({ label: 'Note', multiline: true }), {
          label: 'TODOs',
        }),
      },
    }),
    arrowNav: singleton({
      label: 'Homepage',
      path: 'src/content/site/arrow-nav',
      format: { data: 'yaml' },
      previewUrl: '/',
      schema: {
        landing: fields.object(
          {
            title: fields.text({
              label: 'Title',
              description: 'The line above the face.',
              validation: { isRequired: true },
            }),
            body: fields.text({
              label: 'Body',
              description: 'The line under the title.',
              multiline: true,
            }),
            hint: fields.text({
              label: 'Hint',
              description: 'The line at the bottom. Hidden on a phone.',
            }),
          },
          { label: 'Landing' },
        ),
        nodes: fields.array(
          fields.object({
            id: fields.text({
              label: 'Id',
              description:
                'Stable name. Other screens use it as their parent. The screen named about shows the About paragraphs from Site.',
              validation: { isRequired: true },
            }),
            parent: fields.text({
              label: 'Parent id',
              description: 'landing, or another screen id.',
              validation: { isRequired: true },
            }),
            dir: fields.select({
              label: 'Direction',
              description: 'Where the button sits on the parent screen.',
              options: [
                { label: 'Left', value: 'left' },
                { label: 'Right', value: 'right' },
                { label: 'Up', value: 'up' },
                { label: 'Down', value: 'down' },
              ],
              defaultValue: 'right',
            }),
            label: fields.text({
              label: 'Button label',
              description: 'The word on the button that opens this screen.',
            }),
            title: fields.text({
              label: 'Screen title',
              description: 'Shown above the face on a branch. Leave empty to hide it. A gallery uses each group headline.',
            }),
            body: fields.text({
              label: 'Screen text',
              description: 'The line under the screen title. Leave empty to hide it.',
              multiline: true,
            }),
            kind: fields.select({
              label: 'Kind',
              description: 'Branch is another set of buttons. Gallery is photos. Placeholder is an empty screen.',
              options: [
                { label: 'Branch', value: 'branch' },
                { label: 'Gallery', value: 'gallery' },
                { label: 'Placeholder', value: 'placeholder' },
              ],
              defaultValue: 'branch',
            }),
            groups: fields.array(
              fields.object({
                title: fields.text({
                  label: 'Headline',
                  description: 'Shown under the photo.',
                }),
                caption: fields.text({
                  label: 'Caption',
                  description: 'The line under the headline. Shared by every photo in the group.',
                  multiline: true,
                }),
                product: fields.relationship({
                  label: 'Product',
                  collection: 'products',
                  description: 'Adds a Buy button. Leave empty to hide it.',
                }),
                images: fields.array(
                  fields.object({
                    src: galleryImageField(),
                    alt: fields.text({ label: 'Alt text' }),
                  }),
                  { label: 'Images', itemLabel: (props) => props.fields.alt.value || 'Image' },
                ),
              }),
              {
                label: 'Image groups',
                description:
                  'Shop only. Web, 3D, Product, and Retail take their photos and videos from the Gallery field on each project.',
                itemLabel: (props) => props.fields.title.value || 'Group',
              },
            ),
          }),
          {
            label: 'Screens',
            description: 'Each screen is a button on its parent. About copy is edited under Site.',
            itemLabel: (props) => props.fields.label.value || props.fields.id.value || 'Screen',
          },
        ),
      },
    }),
  },
});
