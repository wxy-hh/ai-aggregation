export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Blob 转 Data URL 失败'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Blob 读取失败'));
    };

    reader.readAsDataURL(blob);
  });
}

// 将 Data URL 的 base64 部分提取出来，如果传入的不是 Data URL 则原样返回
export function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1 || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  return dataUrl.slice(commaIndex + 1);
}

// 读取多个文件为 Data URL，限制最大数量
export function readFilesAsDataUrls(files: File[], maxCount = Infinity): Promise<string[]> {
  const limited = maxCount < files.length ? files.slice(0, maxCount) : Array.from(files);
  return Promise.all(limited.map(blobToDataUrl));
}
