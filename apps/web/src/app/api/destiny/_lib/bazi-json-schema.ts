// JSON Schema for Doubao json_schema structured output - 八字报告
export const BAZI_REPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    coreDestinyTone: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['headline', 'description'],
      additionalProperties: false,
    },
    pillars: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          tooltip: { type: 'string' },
        },
        required: ['label', 'tooltip'],
        additionalProperties: false,
      },
    },
    elementsAndTenGods: {
      type: 'object',
      properties: {
        lifeDimensions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: ['career', 'wealth', 'health', 'love', 'wisdom'] },
              label: { type: 'string' },
              value: { type: 'integer' },
            },
            required: ['key', 'label', 'value'],
            additionalProperties: false,
          },
        },
        lifeDimensionHighlights: {
          type: 'object',
          properties: {
            strength: { type: 'string' },
            caution: { type: 'string' },
          },
          required: ['strength', 'caution'],
          additionalProperties: false,
        },
        tenGodDomains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                enum: ['self', 'expression', 'wealth', 'order', 'resource'],
              },
              label: { type: 'string' },
              technicalLabel: { type: 'string' },
              value: { type: 'integer' },
              description: { type: 'string' },
              positive: { type: 'string' },
              negative: { type: 'string' },
            },
            required: ['key', 'label', 'technicalLabel', 'value', 'description'],
            additionalProperties: false,
          },
        },
        balanceInsight: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            value: { type: 'string' },
            tooltip: { type: 'string' },
          },
          required: ['title', 'value', 'tooltip'],
          additionalProperties: false,
        },
        patternHighlights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              tooltip: { type: 'string' },
            },
            required: ['label', 'tooltip'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'lifeDimensions',
        'lifeDimensionHighlights',
        'tenGodDomains',
        'balanceInsight',
        'patternHighlights',
      ],
      additionalProperties: false,
    },
    modulePersonality: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'bullets'],
      additionalProperties: false,
    },
    moduleCareer: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'bullets'],
      additionalProperties: false,
    },
    moduleLove: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'bullets'],
      additionalProperties: false,
    },
    moduleWealth: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'bullets'],
      additionalProperties: false,
    },
    moduleHealth: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'bullets'],
      additionalProperties: false,
    },
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          detail: {
            type: 'object',
            properties: {
              opportunities: { type: 'array', items: { type: 'string' } },
              risks: { type: 'array', items: { type: 'string' } },
              actions: { type: 'array', items: { type: 'string' } },
            },
            required: ['opportunities', 'risks', 'actions'],
            additionalProperties: false,
          },
        },
        required: ['title', 'summary', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'coreDestinyTone',
    'pillars',
    'elementsAndTenGods',
    'modulePersonality',
    'moduleCareer',
    'moduleLove',
    'moduleWealth',
    'moduleHealth',
    'timeline',
  ],
  additionalProperties: false,
} as const;
