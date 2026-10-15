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

// Videos are not processed by Astro. They live under public/ and are served as-is.
function videoField(label: string, description?: string) {
  return fields.file({
    label,
    description,
    directory: 'public/media/projects',
    publicPath: '/media/projects/',
  });
}

function imageField(label: string) {
  return fields.image({
    label,
    directory: imageDirectory,
    publicPath: imagePublicPath,
  });
}

export default config({
  storage: storage(),
  ui: {
    brand: { name: 'Humansize' },
    navigation: ['projects', '---', 'site'],
  },
  collections: {
    projects: collection({
      label: 'Projects',
      slugField: 'title',
      path: 'src/content/projects/*/',
      format: { data: 'yaml' },
      columns: ['title', 'year', 'published'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        year: fields.integer({ label: 'Start year' }),
        yearEnd: fields.integer({ label: 'End year', description: 'Leave empty for ongoing' }),
        order: fields.integer({ label: 'Order', validation: { isRequired: true } }),
        published: fields.checkbox({
          label: 'Published',
          defaultValue: true,
          description: 'Unpublished projects stay in the repo and off the site.',
        }),
        summary: fields.text({
          label: 'Summary',
          multiline: true,
          description: 'Two or three sentences shown under the title on the project page. A link is [label](https://...).',
        }),
        cover: imageField('Cover'),
        coverVideo: videoField(
          'Cover video',
          'Optional mp4 or webm. Plays muted on a loop instead of the cover image, which becomes the poster. Keep it under 15 MB.',
        ),
        coverAlt: fields.text({ label: 'Cover alt text' }),
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
            label: fields.text({ label: 'Key' }),
            value: fields.text({ label: 'Value' }),
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
            'Show every image in this project\'s process/ folder, sorted by file name. Upload them on GitHub into src/content/projects/<project>/process/. If the folder is empty, the Process photos below are used.',
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
                }),
              }),
            },
            image: {
              label: 'Image',
              schema: fields.object({
                src: imageField('Image'),
                alt: fields.text({ label: 'Alt text' }),
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
                src: videoField('Video', 'mp4 or webm. Plays muted on a loop. Keep it under 15 MB.'),
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
                left: imageField('Left image'),
                leftAlt: fields.text({ label: 'Left alt text' }),
                right: imageField('Right image'),
                rightAlt: fields.text({ label: 'Right alt text' }),
              }),
            },
            process: {
              label: 'Process',
              schema: fields.object({
                images: fields.array(
                  fields.object({
                    src: imageField('Image'),
                    alt: fields.text({ label: 'Alt text' }),
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
        todo: fields.array(fields.text({ label: 'Note', multiline: true }), {
          label: 'TODOs',
          description: 'Editor notes. Not shown on the site.',
        }),
      },
    }),
  },
  singletons: {
    site: singleton({
      label: 'Site',
      path: 'src/content/site/site',
      format: { data: 'yaml' },
      schema: {
        name: fields.text({ label: 'Name' }),
        studio: fields.text({ label: 'Studio' }),
        email: fields.text({ label: 'Email' }),
        intro: fields.markdoc.inline({
          label: 'Intro',
          description:
            'Footer line and the page description. Use the link mark for a name that has a project page, such as /work/atomic.',
          options: inlineLink,
        }),
        timezone: fields.text({
          label: 'Timezone',
          description: 'IANA name, used for the clock. Example: Asia/Tokyo',
        }),
        place: fields.text({ label: 'Place label', description: 'Example: Tokyo' }),
        about: fields.array(
          fields.markdoc.inline({
            label: 'Paragraph',
            description:
              'Use the link mark for a name that has a project page. Leave other names as text.',
            options: inlineLink,
          }),
          {
            label: 'About',
          },
        ),
        socials: fields.array(
          fields.object({
            label: fields.text({ label: 'Label' }),
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
