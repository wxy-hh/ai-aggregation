/**
 * html2pdf.js 类型声明
 *
 * 用于将 HTML 元素转换为 PDF 文件
 */
declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: {
      type?: 'jpeg' | 'png' | 'webp';
      quality?: number;
    };
    html2canvas?: {
      scale?: number;
      useCORS?: boolean;
      letterRendering?: boolean;
      logging?: boolean;
      [key: string]: unknown;
    };
    jsPDF?: {
      unit?: string;
      format?: string;
      orientation?: string;
      compress?: boolean;
      [key: string]: unknown;
    };
    pagebreak?: {
      mode?: string | string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  interface Html2Pdf {
    set(options: Html2PdfOptions): Html2Pdf;
    from(element: HTMLElement): Html2Pdf;
    save(): Promise<void>;
    output(type: string, options?: unknown): Promise<unknown>;
    outputPdf(type?: string): Promise<unknown>;
    outputImg(type?: string): Promise<unknown>;
    then(callback: (pdf: unknown) => void): Promise<unknown>;
    toPdf(): Html2Pdf;
    toImg(): Html2Pdf;
    toContainer(): Html2Pdf;
    toCanvas(): Html2Pdf;
  }

  function html2pdf(): Html2Pdf;
  function html2pdf(element: HTMLElement, options?: Html2PdfOptions): Html2Pdf;

  export default html2pdf;
}
