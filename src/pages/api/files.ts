import { NextApiRequest, NextApiResponse } from 'next';
import { FileAccessManager } from '@/lib/file_access_manager';
import path from 'path';
import fs from 'fs';

// Initialize FileAccessManager with environment variables
const fileManager = new FileAccessManager(process.env.DIRECTORY_BROWSING_PATH || '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { path: filePath, download, zip } = req.query;

    // Validate environment variables
    if (!process.env.DIRECTORY_BROWSING_PATH) {
      console.error('DIRECTORY_BROWSING_PATH is not configured');
      return res.status(500).json({ error: 'DIRECTORY_BROWSING_PATH is not configured' });
    }
    // if (!process.env.STATIC_FILE_BASE_URL) {
    //   return res.status(500).json({ error: 'STATIC_FILE_BASE_URL is not configured' });
    // }

    // Check if directory exists and is accessible
    try {
      const baseDir = process.env.DIRECTORY_BROWSING_PATH;
      console.log('Checking directory:', baseDir);
      
      if (!fs.existsSync(baseDir)) {
        console.error('Directory does not exist:', baseDir);
        return res.status(500).json({ error: `Directory does not exist: ${baseDir}` });
      }

      // Try to read the directory to check permissions
      fs.readdirSync(baseDir);
      console.log('Directory is accessible:', baseDir);
    } catch (error: any) {
      console.error('Directory access error:', error);
      return res.status(500).json({ error: `Directory access error: ${error.message}` });
    }

    try {
      if (download) {
        // Download file
        const fileStream = fileManager.createReadStream(filePath as string);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath as string)}"`);
        fileStream.pipe(res);
      } else if (zip) {
        // Download directory as zip
        const zipBuffer = await fileManager.createZipArchive(filePath as string);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath as string)}.zip"`);
        res.send(zipBuffer);
      } else {
        // List directory contents
        console.log('Listing directory:', filePath || 'root');
        const result = fileManager.listDirectory(filePath as string);
        return res.status(200).json(result);
      }
    } catch (error: any) {
      console.error('File system error:', error);
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  } 
  else if (req.method === 'DELETE') {
    const { path: folder } = req.query;
    const { paths } = req.body;
    try {
      if (paths && Array.isArray(paths)) {
        for (const path of paths) {
          await fileManager.deleteFolder(path as string);
        }
      } else {
        await fileManager.deleteFolder(folder as string);
      }
      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error: any) {
      console.error('File deletion error:', error);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  }

  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
} 