const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BASE_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

/**
 * Save a file buffer to disk under a non-predictable path.
 * Returns the relative storage path (stored in DB — never returned to clients).
 */
const saveFile = async (buffer, originalName, sessionId) => {
  const sessionDir = path.join(BASE_DIR, sessionId.toString());
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  const ext = path.extname(originalName).toLowerCase();
  const filename = `${uuidv4()}${ext}`;
  const filePath = path.join(sessionDir, filename);
  fs.writeFileSync(filePath, buffer);
  // Return path relative to BASE_DIR
  return path.join(sessionId.toString(), filename);
};

/**
 * Get a readable stream for a stored file.
 * Throws if file doesn't exist.
 */
const getFileStream = (storagePath) => {
  const fullPath = path.join(BASE_DIR, storagePath);
  if (!fs.existsSync(fullPath)) {
    const err = new Error('File not found');
    err.statusCode = 404;
    throw err;
  }
  return fs.createReadStream(fullPath);
};

/**
 * Get file buffer for integrity checking before print.
 */
const getFileBuffer = (storagePath) => {
  const fullPath = path.join(BASE_DIR, storagePath);
  if (!fs.existsSync(fullPath)) {
    const err = new Error('File not found');
    err.statusCode = 404;
    throw err;
  }
  return fs.readFileSync(fullPath);
};

/**
 * Securely delete a file from storage and verify it is removed.
 */
const deleteFile = (storagePath) => {
  try {
    const fullPath = path.join(BASE_DIR, storagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return !fs.existsSync(fullPath);
    }
    return true; // Already removed
  } catch (err) {
    console.error('[STORAGE] Delete failed:', storagePath, err.message);
    return false;
  }
};

/**
 * Delete an entire session directory and verify it is removed.
 */
const deleteSessionDirectory = (sessionId) => {
  try {
    const sessionDir = path.join(BASE_DIR, sessionId.toString());
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      return !fs.existsSync(sessionDir);
    }
    return true; // Already removed
  } catch (err) {
    console.error('[STORAGE] Session dir delete failed:', sessionId, err.message);
    return false;
  }
};

/**
 * Check if a file is already deleted/does not exist in storage.
 */
const verifyFileDeleted = (storagePath) => {
  const fullPath = path.join(BASE_DIR, storagePath);
  return !fs.existsSync(fullPath);
};

module.exports = { saveFile, getFileStream, getFileBuffer, deleteFile, deleteSessionDirectory, verifyFileDeleted };
