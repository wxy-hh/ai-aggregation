declare module 'mammoth' {
  export interface Image {
    read(encoding?: string): Promise<Buffer | string>;
    contentType: string;
  }

  export interface ConversionResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  export interface ConvertOptions {
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: any;
    ignoreEmptyParagraphs?: boolean;
  }

  export function convertToHtml(
    input: { buffer: Buffer } | { path: string },
    options?: ConvertOptions
  ): Promise<ConversionResult>;

  export function extractRawText(
    input: { buffer: Buffer } | { path: string }
  ): Promise<ConversionResult>;

  export const images: {
    inline: (callback: (image: Image) => Promise<{ src: string }>) => any;
  };
}
