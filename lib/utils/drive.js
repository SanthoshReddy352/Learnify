/**
 * Extract Google Drive file ID from various link formats
 */
export function extractFileId(link) {
  if (!link) return null;
  
  // Standard share link: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // Direct link: https://drive.google.com/open?id=FILE_ID
  // Download link: https://drive.google.com/uc?id=FILE_ID
  
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get the preview URL for a Google Drive file ID
 */
export function getPreviewLink(fileId) {
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Get the direct download URL for a Google Drive file ID
 */
export function getDownloadLink(fileId) {
  if (!fileId) return null;
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
