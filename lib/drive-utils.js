/**
 * Extracts the file ID from a standard Google Drive sharing link
 * @param {string} url - The Google Drive sharing URL
 * @returns {string|null} - The file ID or null if not found
 */
export function extractDriveId(url) {
  if (!url) return null;
  
  // Standard format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // Folders: https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Returns a link suitable for a Google Drive preview/iframe
 * @param {string} url - The Google Drive sharing URL
 * @returns {string} 
 */
export function getDrivePreviewLink(url) {
  const id = extractDriveId(url);
  if (!id) return url;
  
  // If it's a folder, keep as is but ensure /view
  if (url.includes('/folders/')) {
    return `https://drive.google.com/drive/folders/${id}`;
  }
  
  return `https://drive.google.com/file/d/${id}/view?usp=sharing`;
}

/**
 * Returns a link for direct file download from Google Drive
 * @param {string} url - The Google Drive sharing URL
 * @returns {string}
 */
export function getDriveDownloadLink(url) {
  const id = extractDriveId(url);
  if (!id || url.includes('/folders/')) return url;
  
  return `https://drive.google.com/uc?export=download&id=${id}`;
}
/**
 * Returns a link suitable for a Google Drive iframe embedding
 * @param {string} url - The Google Drive sharing URL
 * @returns {string} 
 */
export function getDriveEmbedLink(url) {
  const id = extractDriveId(url);
  if (!id) return url;
  
  // Folders use a list view
  if (url.includes('/folders/')) {
    return `https://drive.google.com/embeddedfolderview?id=${id}#list`;
  }
  
  return `https://drive.google.com/file/d/${id}/preview`;
}
