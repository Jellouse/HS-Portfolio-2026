import { withUpload } from './src/lib/VideoUrlInput';
import { withImageCms } from './src/lib/image-field-cms';
import { config, fields, collection, singleton } from '@keystatic/core';

const repo = 'Jellouse/HS-Portfolio-2026';

// `npm run dev` writes files locally. A production build commits through GitHub.
// KEYSTATIC_STORAGE=local or KEYSTATIC_STORAGE=github overrides that, on both
// the admin UI and the API. No branchPrefix: any prefix is allowed, and the
// branch menu opens on the repository default branch (main).
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

const frame = fields.select({
  label: 'Frame',
  options: [
    { label: 'Full', value: 'full' },
    { label: 'Wide', value: 'wide' },
    { label: 'Medium', value: 'medium' },
    { label: 'Narrow', value: 'narrow' },
  ],
  defaultValue: 'full',
});

// Videos: a URL (Cloudflare R2, uploaded with the button) or an older local path under
// /media/projects/. Not processed by Astro, served as-is.
function videoField(label: string, description?: string) {
  const field = fields.text({
    label,
    description: [description, 'Upload with the button, or paste a URL.'].filter(Boolean).join(' '),
  });
  return { ...field, Input: withUpload(field.Input as any) };
}

function imageField(
  label: string,
  opts?: { required?: boolean; description?: string },
) {
  const field = fields.image({
    label,
    directory: imageDirectory,
    publicPath: imagePublicPath,
    ...(opts?.description ? { description: opts.description } : {}),
    ...(opts?.required ? { validation: { isRequired: true as const } } : {}),
  });
  // Compress in the browser before the file enters form state / the GitHub commit.
  return { ...field, Input: withImageCms(field.Input as any) };
}

export default config({
  storage: storage(),
  ui: {
    brand: { name: 'Humansize' },
    navigation: ['projects', 'projectOrder', '---', 'site'],
  },
  collections: {
    projects: collection({
      label: 'Projects',
      slugField: 'title',
      path: 'src/content/projects/*/',
      format: { data: 'yaml' },
      columns: ['title', 'year', 'published'],
      // Live SSR preview for signed-in editors with push access. {branch} is the CMS branch.
      previewUrl: '/preview/{slug}/?branch={branch}',
      schema: {
        title: fields.slug({
          name: {
            label: 'Title',
            validation: { isRequired: true, length: { min: 1 } },
          },
        }),
        year: fields.integer({ label: 'Start year' }),
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
        coverVideo: videoField(
          'Cover video',
          'Optional mp4 or webm. Plays muted on a loop instead of the cover image, which becomes the poster. Keep it short; H.264 MP4 plays everywhere.',
        ),
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
                heading: fields.text({ label: 'Heading' }),
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
                frame,
                flush: fields.checkbox({
                  label: 'Flush',
                  defaultValue: false,
                  description:
                    'White or transparent edges. No rounded corners and no padding.',
                }),
              }),
            },
            video: {
              label: 'Video',
              schema: fields.object({
                src: videoField('Video', 'mp4 or webm. Plays muted on a loop. Keep it short; H.264 MP4 plays everywhere.'),
                poster: imageField('Poster'),
                alt: fields.text({ label: 'Label', description: 'Optional description of the video.' }),
                frame,
                flush: fields.checkbox({
                  label: 'Flush',
                  defaultValue: false,
                  description:
                    'White or transparent edges. No rounded corners and no padding.',
                }),
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
                right: imageField('Right image', { required: true }),
                rightAlt: fields.text({
                  label: 'Right alt text',
                  description: 'Optional.',
                }),
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
                    flush: fields.checkbox({
                      label: 'Flush',
                      defaultValue: false,
                      description:
                        'White or transparent edges. No rounded corners and no padding.',
                    }),
                  }),
                  {
                    label: 'Photos',
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
              'Drag to set the homepage order. Projects not in this list still appear, at the end (newer year first).',
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
            'Footer line and the page description. Use the link mark for a name that has a project page, such as /work/atomic. Required by the build; markdoc fields cannot set isRequired.',
          options: inlineLink,
        }),
        timezone: fields.text({
          label: 'Timezone',
          description: 'IANA name, used for the clock. Example: Asia/Tokyo',
          validation: { isRequired: true, length: { min: 1 } },
        }),
        place: fields.text({
          label: 'Place label',
          description: 'Example: Tokyo',
          validation: { isRequired: true, length: { min: 1 } },
        }),
        about: fields.array(
          fields.markdoc.inline({
            label: 'Paragraph',
            description:
              'Use the link mark for a name that has a project page. Leave other names as text. Markdoc fields cannot set isRequired.',
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
  },
});
