import { config, fields, collection, singleton } from '@keystatic/core';

const imageDirectory = 'src/content/projects';
const imagePublicPath = '/src/content/projects';

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

function imageField(label: string) {
  return fields.image({
    label,
    directory: imageDirectory,
    publicPath: imagePublicPath,
  });
}

export default config({
  storage: { kind: 'local' },
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
        caption: fields.text({
          label: 'Caption',
          description: 'Homepage line under the image. Example: Atomic Ski, 2026',
        }),
        year: fields.integer({ label: 'Year' }),
        order: fields.integer({ label: 'Order', validation: { isRequired: true } }),
        published: fields.checkbox({
          label: 'Published',
          defaultValue: true,
          description: 'Unpublished projects stay in the repo and off the site.',
        }),
        summary: fields.text({
          label: 'Summary',
          multiline: true,
          description: 'Two or three sentences for the homepage. A link is [label](https://...).',
        }),
        cover: imageField('Cover'),
        coverAlt: fields.text({ label: 'Cover alt text' }),
        coverFrame: frame,
        rounded: fields.checkbox({
          label: 'Rounded image',
          defaultValue: true,
          description: 'Turn off for a square frame with a little padding.',
        }),
        credits: fields.array(
          fields.object({
            role: fields.text({ label: 'Role' }),
            name: fields.text({ label: 'Name' }),
            url: fields.text({ label: 'URL', description: 'Optional. The name is underlined as a link.' }),
          }),
          {
            label: 'Credit',
            itemLabel: (props) => props.fields.name.value || 'Credit',
          },
        ),
        info: fields.array(
          fields.object({
            label: fields.text({ label: 'Label' }),
            value: fields.text({ label: 'Value' }),
            href: fields.text({ label: 'Link', description: 'Optional URL.' }),
          }),
          {
            label: 'Info',
            itemLabel: (props) => props.fields.label.value || 'Info',
          },
        ),
        blocks: fields.blocks(
          {
            text: {
              label: 'Text',
              schema: {
                heading: fields.text({ label: 'Heading' }),
                text: fields.text({
                  label: 'Text',
                  multiline: true,
                  description: 'A link is [label](https://...).',
                }),
              },
            },
            image: {
              label: 'Image',
              schema: {
                src: imageField('Image'),
                alt: fields.text({ label: 'Alt text' }),
                frame,
              },
            },
            pair: {
              label: 'Image pair',
              schema: {
                left: imageField('Left image'),
                leftAlt: fields.text({ label: 'Left alt text' }),
                right: imageField('Right image'),
                rightAlt: fields.text({ label: 'Right alt text' }),
              },
            },
            process: {
              label: 'Process',
              schema: {
                images: fields.array(
                  fields.object({
                    src: imageField('Image'),
                    alt: fields.text({ label: 'Alt text' }),
                  }),
                  {
                    label: 'Photos',
                    itemLabel: (props) => props.fields.alt.value || 'Photo',
                  },
                ),
              },
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
        intro: fields.text({
          label: 'Intro',
          multiline: true,
          description: 'One factual sentence about Johann and Humansize.',
        }),
        timezone: fields.text({
          label: 'Timezone',
          description: 'IANA name, used for the clock. Example: Asia/Tokyo',
        }),
        place: fields.text({ label: 'Place label', description: 'Example: Tokyo' }),
        about: fields.array(
          fields.text({
            label: 'Paragraph',
            multiline: true,
            description: 'A link is [label](https://...).',
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
