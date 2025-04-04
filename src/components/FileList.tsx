import { useState } from 'react';
import {
  DocumentIcon,
  DocumentTextIcon,
  DocumentChartBarIcon,
  PhotoIcon,
  FolderIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
  url?: string;
  children?: FileItem[];
  itemCount?: number;
}

interface FileListProps {
  items: FileItem[];
  onFolderClick: (file: FileItem) => Promise<void>;
  onFileDownload: (path: string) => Promise<void>;
  onFolderDownload: (path: string) => Promise<void>;
  expandedFolders: Set<string>;
  level?: number;
}

const FileList = ({
  items,
  onFolderClick,
  onFileDownload,
  onFolderDownload,
  expandedFolders,
  level = 0
}: FileListProps) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'pdf':
        return <DocumentTextIcon className="h-5 w-5 text-red-500" />;
      case 'doc':
      case 'docx':
        return <DocumentTextIcon className="h-5 w-5 text-blue-500" />;
      case 'xls':
      case 'xlsx':
        return <DocumentChartBarIcon className="h-5 w-5 text-green-500" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
        return <PhotoIcon className="h-5 w-5 text-purple-500" />;
      case 'txt':
        return <DocumentTextIcon className="h-5 w-5 text-gray-500" />;
      default:
        return <DocumentIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <div className="divide-y divide-gray-200">
      {items.map((file) => {
        const isExpanded = expandedFolders.has(file.path);
        
        return (
          <div key={file.path}>
            <div 
              className={`px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between text-sm ${
                file.isDirectory ? 'bg-yellow-50 hover:bg-yellow-100' : ''
              }`}
              style={{ paddingLeft: `${level * 20 + 24}px` }}
              onClick={() => {
                if (file.isDirectory) {
                  onFolderClick(file);
                } else if (file.url) {
                  window.open(file.url, '_blank');
                }
              }}
            >
              <div className="flex items-center space-x-3">
                {file.isDirectory ? (
                  <>
                    <ChevronRightIcon 
                      className={`h-5 w-5 text-yellow-500 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <FolderIcon className="h-5 w-5 text-yellow-500" />
                  </>
                ) : (
                  getFileIcon(file.name)
                )}
                <span className={`${file.isDirectory ? 'text-yellow-800 font-medium' : 'text-gray-900'}`}>
                  {file.name}
                  {file.isDirectory && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({file.itemCount || 0} items)
                    </span>
                  )}
                </span>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span>{formatFileSize(file.size)}</span>
                  <span>•</span>
                  <span>{formatDate(file.modified)}</span>
                </div>
                <div 
                  className="flex space-x-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {file.isDirectory ? (
                    <button
                      onClick={() => onFolderDownload(file.path)}
                      className="text-gray-500 hover:text-purple-600 p-1"
                      title="Download as ZIP"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onFileDownload(file.path)}
                      className="text-gray-500 hover:text-green-600 p-1"
                      title="Download file"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {file.isDirectory && isExpanded && file.children && (
              <FileList
                items={file.children}
                onFolderClick={onFolderClick}
                onFileDownload={onFileDownload}
                onFolderDownload={onFolderDownload}
                expandedFolders={expandedFolders}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FileList; 