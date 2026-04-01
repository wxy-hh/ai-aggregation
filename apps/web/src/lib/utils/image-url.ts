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
