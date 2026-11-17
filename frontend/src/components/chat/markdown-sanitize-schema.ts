

import { defaultSchema } from 'rehype-sanitize';


const EXTRA_TAGS = [
    'span',
    'div',
    'img',
    'pre',
    'code',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'del',
    'details',
    'summary',
    'figure',
    'figcaption',
    'kbd',
    'mark',
    'sup',
    'sub',
    'dl',
    'dt',
    'dd',
    'hr',
    'br',
    'ins',
];

export const markdownSanitizeSchema = {
    ...defaultSchema,

    tagNames: [...(defaultSchema.tagNames || []), ...EXTRA_TAGS],

    attributes: {
        ...(defaultSchema.attributes || {}),




        div: [...(defaultSchema.attributes?.div || []), 'dataCallout', 'data-callout'],



        span: [
            ...(defaultSchema.attributes?.span || []),
            'className',
            'dataSource',
            'dataLocation',
            'dataExcerpt',
        ],



        a: [...(defaultSchema.attributes?.a || []), 'href', 'title', 'target', 'rel'],

        img: [
            ...(defaultSchema.attributes?.img || []),
            'src',
            'alt',
            'title',
            'width',
            'height',
        ],




        code: [...(defaultSchema.attributes?.code || []), 'className'],

        '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'id'],
    },

    protocols: {
        ...(defaultSchema.protocols || {}),



        href: ['http', 'https', 'mailto', 'tel', '#citation-data', 'view-content'],
        src: ['http', 'https'],
    },


    allowProtocols: false,
};

export default markdownSanitizeSchema;
