// JSON Schema for Doubao json_schema structured output - 八字报告
export const BAZI_REPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    profileOverview: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        genderLabel: { type: 'string' },
        birthText: { type: 'string' },
        lunarText: { type: 'string' },
        locationText: { type: 'string' },
      },
      required: ['name', 'genderLabel', 'birthText', 'locationText'],
      additionalProperties: false,
    },
    coreDestinyTone: {
      type: 'object',
      properties: {
        tag: { type: 'string' },
        chartSummary: { type: 'string' },
        headline: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['tag', 'chartSummary', 'headline', 'description'],
      additionalProperties: false,
    },
    pillars: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stem: { type: 'string' },
          branch: { type: 'string' },
          label: { type: 'string' },
          element: { type: 'string', enum: ['metal', 'wood', 'water', 'fire', 'earth'] },
          tooltip: { type: 'string' },
        },
        required: ['stem', 'branch', 'label', 'element', 'tooltip'],
        additionalProperties: false,
      },
    },
    elementsAndTenGods: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: ['metal', 'wood', 'water', 'fire', 'earth'] },
              label: { type: 'string' },
              value: { type: 'integer' },
            },
            required: ['key', 'label', 'value'],
            additionalProperties: false,
          },
        },
        tenGods: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              label: { type: 'string' },
              value: { type: 'integer' },
              tooltip: { type: 'string' },
            },
            required: ['key', 'label', 'value', 'tooltip'],
            additionalProperties: false,
          },
        },
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
      required: ['elements', 'tenGods'],
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
          year: { type: 'integer' },
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
        required: ['year', 'title', 'summary', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'profileOverview',
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
