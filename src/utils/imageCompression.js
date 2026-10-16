const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
  reader.readAsDataURL(file);
});

const loadImage = (source) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Gambar tidak dapat diproses.'));
  image.src = source;
});

const renderWebP = (image, width, height, quality) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Browser tidak mendukung kompresi gambar.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/webp', quality);
};

const dataUrlBytes = (value) => {
  const base64 = String(value || '').split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
};

export const compressImageToWebP = async (file, {
  maxWidth = 1400,
  maxHeight = 1400,
  quality = 0.82,
  maxBytes = 350 * 1024
} = {}) => {
  if (!file) throw new Error('File gambar tidak ditemukan.');

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  let currentQuality = Math.min(0.9, Math.max(0.45, quality));
  let result = renderWebP(image, width, height, currentQuality);
  if (!result.startsWith('data:image/webp')) {
    throw new Error('Browser ini belum mendukung kompresi WebP.');
  }
  while (dataUrlBytes(result) > maxBytes && currentQuality > 0.5) {
    currentQuality = Math.max(0.5, currentQuality - 0.08);
    result = renderWebP(image, width, height, currentQuality);
  }
  return result;
};

export const stripImagesFromTransactionItems = (items = []) => (Array.isArray(items) ? items : []).map((item) => {
  const { image: _image, imageUrl: _imageUrl, photo: _photo, thumbnail: _thumbnail, ...cleanItem } = item || {};
  return {
    ...cleanItem,
    toppings: Array.isArray(cleanItem.toppings)
      ? cleanItem.toppings.map((topping) => {
          const { image: _toppingImage, imageUrl: _toppingImageUrl, photo: _toppingPhoto, ...cleanTopping } = topping || {};
          return cleanTopping;
        })
      : []
  };
});
