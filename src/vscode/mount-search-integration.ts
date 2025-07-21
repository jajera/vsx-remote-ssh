import * as vscode from 'vscode';
import * as path from 'path';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';
import { SSHConnectionManager } from '../interfaces/ssh';
import { MountAwareFileSystemProvider } from '../interfaces/filesystem';

/**
 * Configuration for search operations
 */
export interface SearchConfig {
  maxResults: number;
  timeout: number;
  batchSize: number;
  excludePatterns: string[];
  includePatterns: string[];
}

/**
 * Default search configuration
 */
export const DefaultSearchConfig: SearchConfig = {
  maxResults: 1000,
  timeout: 30000, // 30 seconds
  batchSize: 50,
  excludePatterns: [
    '**/node_modules/**',
    '**/.*/**',
    '**/*.log',
    '**/dist/**',
    '**/build/**',
    '**/out/**'
  ],
  includePatterns: []
};

/**
 * Search query interface
 */
export interface SearchQuery {
  pattern: string;
  isRegExp?: boolean;
  isCaseSensitive?: boolean;
}

/**
 * Search options interface
 */
export interface SearchOptions {
  includes?: string[];
  excludes?: string[];
  folder?: vscode.Uri;
}

/**
 * Text search match interface
 */
export interface TextSearchMatch {
  text: string;
  matches: vscode.Range[];
}

/**
 * Text search result interface
 */
export interface TextSearchResult {
  uri: vscode.Uri;
  ranges: vscode.Range[];
  preview: TextSearchMatch;
}

/**
 * Search result for a mounted folder
 */
export interface MountSearchResult {
  uri: vscode.Uri;
  preview: TextSearchMatch;
  ranges: vscode.Range[];
}

/**
 * Search provider for mounted folders
 */
export class MountSearchProvider {
  private mountManager: MountManager;
  private connectionManager: SSHConnectionManager;
  private fileSystemProvider: MountAwareFileSystemProvider;
  private config: SearchConfig;
  private searchCache: Map<string, { results: MountSearchResult[]; timestamp: number }> = new Map();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    mountManager: MountManager,
    connectionManager: SSHConnectionManager,
    fileSystemProvider: MountAwareFileSystemProvider,
    config?: Partial<SearchConfig>
  ) {
    this.mountManager = mountManager;
    this.connectionManager = connectionManager;
    this.fileSystemProvider = fileSystemProvider;
    this.config = { ...DefaultSearchConfig, ...config };
  }

  /**
   * Search for text in mounted folders
   */
  async searchText(
    query: SearchQuery,
    options: SearchOptions = {},
    onProgress?: (result: TextSearchResult) => void,
    cancellationToken?: { isCancellationRequested: boolean }
  ): Promise<{ results: TextSearchResult[]; limitHit: boolean }> {
    const startTime = Date.now();
    const results: TextSearchResult[] = [];
    let searchedFiles = 0;

    try {
      // Get all connected mount points
      const mountPoints = this.mountManager.getMountPoints()
        .filter(mp => mp.status === MountStatus.Connected);

      if (mountPoints.length === 0) {
        return { results, limitHit: false };
      }

      // Search in each mount point
      for (const mountPoint of mountPoints) {
        if (cancellationToken?.isCancellationRequested) {
          break;
        }

        // Check if this mount should be searched based on include patterns
        if (!this.shouldSearchMount(mountPoint, options)) {
          continue;
        }

        try {
          const mountResults = await this.searchInMount(
            mountPoint,
            query,
            options,
            onProgress,
            cancellationToken
          );

          results.push(...mountResults.results);
          searchedFiles += mountResults.searchedFiles;

          // Check if we've hit the result limit
          if (results.length >= this.config.maxResults) {
            return { results: results.slice(0, this.config.maxResults), limitHit: true };
          }

          // Check timeout
          if (Date.now() - startTime > this.config.timeout) {
            return { results, limitHit: true };
          }
        } catch (error) {
          console.error(`Search failed in mount ${mountPoint.displayName}:`, error);
          // Continue with other mounts
        }
      }

      return { results, limitHit: false };
    } catch (error) {
      console.error('Text search failed:', error);
      throw error;
    }
  }

  /**
   * Search for files in mounted folders
   */
  async searchFiles(
    query: SearchQuery,
    options: SearchOptions = {},
    cancellationToken?: { isCancellationRequested: boolean }
  ): Promise<vscode.Uri[]> {
    const results: vscode.Uri[] = [];
    const startTime = Date.now();

    try {
      // Get all connected mount points
      const mountPoints = this.mountManager.getMountPoints()
        .filter(mp => mp.status === MountStatus.Connected);

      if (mountPoints.length === 0) {
        return results;
      }

      // Search in each mount point
      for (const mountPoint of mountPoints) {
        if (cancellationToken?.isCancellationRequested) {
          break;
        }

        // Check if this mount should be searched
        if (!this.shouldSearchMount(mountPoint, options)) {
          continue;
        }

        try {
          const mountResults = await this.searchFilesInMount(
            mountPoint,
            query,
            options,
            cancellationToken
          );

          results.push(...mountResults);

          // Check if we've hit the result limit
          if (results.length >= this.config.maxResults) {
            return results.slice(0, this.config.maxResults);
          }

          // Check timeout
          if (Date.now() - startTime > this.config.timeout) {
            break;
          }
        } catch (error) {
          console.error(`File search failed in mount ${mountPoint.displayName}:`, error);
          // Continue with other mounts
        }
      }

      return results;
    } catch (error) {
      console.error('File search failed:', error);
      throw error;
    }
  }

  /**
   * Search for text in a specific mount point
   */
  private async searchInMount(
    mountPoint: MountPoint,
    query: SearchQuery,
    options: SearchOptions,
    onProgress?: (result: TextSearchResult) => void,
    cancellationToken?: { isCancellationRequested: boolean }
  ): Promise<{ results: TextSearchResult[]; searchedFiles: number }> {
    const results: TextSearchResult[] = [];
    let searchedFiles = 0;

    // Create cache key for this search
    const cacheKey = this.createSearchCacheKey(mountPoint, query, options);
    
    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      // Return cached results
      for (const result of cached.results) {
        if (cancellationToken?.isCancellationRequested) {
          break;
        }
        const textResult: TextSearchResult = {
          uri: result.uri,
          preview: result.preview,
          ranges: result.ranges
        };
        results.push(textResult);
        if (onProgress) {
          onProgress(textResult);
        }
      }
      return { results, searchedFiles: cached.results.length };
    }

    const searchResults: MountSearchResult[] = [];

    try {
      // Get connection for this mount
      const connection = this.connectionManager.getConnection(mountPoint.connectionId);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`Connection not available for mount ${mountPoint.displayName}`);
      }

      // Search recursively starting from mount root
      const mountUri = mountPoint.uri;
      await this.searchDirectory(
        mountUri,
        query,
        options,
        onProgress,
        cancellationToken,
        searchResults,
        searchedFiles
      );

      // Cache the results
      this.searchCache.set(cacheKey, {
        results: searchResults,
        timestamp: Date.now()
      });

      // Clean up old cache entries
      this.cleanupSearchCache();

      // Convert to TextSearchResult format
      for (const result of searchResults) {
        results.push({
          uri: result.uri,
          preview: result.preview,
          ranges: result.ranges
        });
      }

    } catch (error) {
      console.error(`Search failed in mount ${mountPoint.displayName}:`, error);
      throw error;
    }

    return { results, searchedFiles };
  }

  /**
   * Search for files in a specific mount point
   */
  private async searchFilesInMount(
    mountPoint: MountPoint,
    query: SearchQuery,
    options: SearchOptions,
    cancellationToken?: { isCancellationRequested: boolean }
  ): Promise<vscode.Uri[]> {
    const results: vscode.Uri[] = [];

    try {
      // Get connection for this mount
      const connection = this.connectionManager.getConnection(mountPoint.connectionId);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`Connection not available for mount ${mountPoint.displayName}`);
      }

      // Search recursively starting from mount root
      const mountUri = mountPoint.uri;
      await this.searchFilesInDirectory(
        mountUri,
        query,
        options,
        cancellationToken,
        results
      );

    } catch (error) {
      console.error(`File search failed in mount ${mountPoint.displayName}:`, error);
      throw error;
    }

    return results;
  }

  /**
   * Search for text in a directory recursively
   */
  private async searchDirectory(
    dirUri: vscode.Uri,
    query: SearchQuery,
    options: SearchOptions,
    onProgress?: (result: TextSearchResult) => void,
    cancellationToken?: { isCancellationRequested: boolean },
    searchResults: MountSearchResult[] = [],
    searchedFiles: number = 0
  ): Promise<void> {
    if (cancellationToken?.isCancellationRequested || searchResults.length >= this.config.maxResults) {
      return;
    }

    try {
      // Read directory contents
      const entries = await this.fileSystemProvider.readDirectory(dirUri);

      // Process files and directories in batches
      for (let i = 0; i < entries.length; i += this.config.batchSize) {
        if (cancellationToken?.isCancellationRequested || searchResults.length >= this.config.maxResults) {
          break;
        }

        const batch = entries.slice(i, i + this.config.batchSize);
        
        for (const [name, type] of batch) {
          if (cancellationToken?.isCancellationRequested || searchResults.length >= this.config.maxResults) {
            break;
          }

          const entryUri = vscode.Uri.joinPath(dirUri, name);
          
          // Check if this entry should be excluded
          if (this.shouldExcludeEntry(entryUri, type, options)) {
            continue;
          }

          if (type === vscode.FileType.Directory) {
            // Recursively search subdirectory
            await this.searchDirectory(
              entryUri,
              query,
              options,
              onProgress,
              cancellationToken,
              searchResults,
              searchedFiles
            );
          } else if (type === vscode.FileType.File) {
            // Search in file
            try {
              const fileResults = await this.searchInFile(entryUri, query, options);
              if (fileResults.length > 0) {
                for (const result of fileResults) {
                  const mountResult: MountSearchResult = {
                    uri: result.uri,
                    preview: result.preview,
                    ranges: result.ranges
                  };
                  searchResults.push(mountResult);
                  if (onProgress) {
                    onProgress(result);
                  }
                }
              }
              searchedFiles++;
            } catch (error) {
              // Skip files that can't be read
              console.debug(`Failed to search in file ${entryUri}:`, error);
            }
          }
        }

        // Small delay between batches to prevent overwhelming the connection
        if (i + this.config.batchSize < entries.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } catch (error) {
      console.error(`Failed to search directory ${dirUri}:`, error);
      // Continue with other directories
    }
  }

  /**
   * Search for files in a directory recursively
   */
  private async searchFilesInDirectory(
    dirUri: vscode.Uri,
    query: SearchQuery,
    options: SearchOptions,
    cancellationToken?: { isCancellationRequested: boolean },
    results: vscode.Uri[] = []
  ): Promise<void> {
    if (cancellationToken?.isCancellationRequested || results.length >= this.config.maxResults) {
      return;
    }

    try {
      // Read directory contents
      const entries = await this.fileSystemProvider.readDirectory(dirUri);

      for (const [name, type] of entries) {
        if (cancellationToken?.isCancellationRequested || results.length >= this.config.maxResults) {
          break;
        }

        const entryUri = vscode.Uri.joinPath(dirUri, name);
        
        // Check if this entry should be excluded
        if (this.shouldExcludeEntry(entryUri, type, options)) {
          continue;
        }

        if (type === vscode.FileType.Directory) {
          // Recursively search subdirectory
          await this.searchFilesInDirectory(entryUri, query, options, cancellationToken, results);
        } else if (type === vscode.FileType.File) {
          // Check if file matches the query
          if (this.matchesFileQuery(name, query)) {
            results.push(entryUri);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to search files in directory ${dirUri}:`, error);
      // Continue with other directories
    }
  }

  /**
   * Search for text in a specific file
   */
  private async searchInFile(
    fileUri: vscode.Uri,
    query: SearchQuery,
    options: SearchOptions
  ): Promise<TextSearchResult[]> {
    const results: TextSearchResult[] = [];

    try {
      // Read file content
      const content = await this.fileSystemProvider.readFile(fileUri);
      const text = Buffer.from(content).toString('utf8');
      
      // Split into lines for searching
      const lines = text.split('\n');
      
      // Search each line
      for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const line = lines[lineNumber];
        const matches = this.findMatches(line, query);
        
        if (matches.length > 0) {
          // Create preview text (show some context around the match)
          const previewStart = Math.max(0, lineNumber - 1);
          const previewEnd = Math.min(lines.length - 1, lineNumber + 1);
          const previewLines = lines.slice(previewStart, previewEnd + 1);
          
          results.push({
            uri: fileUri,
            ranges: matches.map(match => new vscode.Range(
              lineNumber, match.start,
              lineNumber, match.end
            )),
            preview: {
              text: previewLines.join('\n'),
              matches: matches.map(match => new vscode.Range(
                lineNumber - previewStart, match.start,
                lineNumber - previewStart, match.end
              ))
            }
          });
        }
      }
    } catch (error) {
      // File might be binary or unreadable
      console.debug(`Failed to search in file ${fileUri}:`, error);
    }

    return results;
  }

  /**
   * Find matches in a line of text
   */
  private findMatches(line: string, query: SearchQuery): { start: number; end: number }[] {
    const matches: { start: number; end: number }[] = [];
    
    if (query.isRegExp) {
      // Handle regex search
      const flags = (query.isCaseSensitive ? '' : 'i') + 'g';
      const regex = new RegExp(query.pattern, flags);
      let match;
      
      while ((match = regex.exec(line)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length
        });
        
        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else {
      // Handle plain text search
      const searchText = query.isCaseSensitive ? line : line.toLowerCase();
      const pattern = query.isCaseSensitive ? query.pattern : query.pattern.toLowerCase();
      
      let index = 0;
      while ((index = searchText.indexOf(pattern, index)) !== -1) {
        matches.push({
          start: index,
          end: index + pattern.length
        });
        index += pattern.length;
      }
    }
    
    return matches;
  }

  /**
   * Check if a file matches the file search query
   */
  private matchesFileQuery(fileName: string, query: SearchQuery): boolean {
    const pattern = query.pattern;
    
    if (!pattern) {
      return true;
    }

    // Simple glob-like matching
    if (pattern.includes('*') || pattern.includes('?')) {
      const regex = new RegExp(
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.'),
        query.isCaseSensitive ? '' : 'i'
      );
      return regex.test(fileName);
    } else {
      // Exact match or substring match
      const searchName = query.isCaseSensitive ? fileName : fileName.toLowerCase();
      const searchPattern = query.isCaseSensitive ? pattern : pattern.toLowerCase();
      return searchName.includes(searchPattern);
    }
  }

  /**
   * Check if an entry should be excluded from search
   */
  private shouldExcludeEntry(
    uri: vscode.Uri,
    type: vscode.FileType,
    options: SearchOptions
  ): boolean {
    const relativePath = uri.path;
    
    // Check exclude patterns
    const excludes = [...this.config.excludePatterns, ...(options.excludes || [])];
    for (const pattern of excludes) {
      if (this.matchesGlob(relativePath, pattern)) {
        return true;
      }
    }
    
    // Check include patterns (if any)
    const includes = [...this.config.includePatterns, ...(options.includes || [])];
    if (includes.length > 0) {
      let included = false;
      for (const pattern of includes) {
        if (this.matchesGlob(relativePath, pattern)) {
          included = true;
          break;
        }
      }
      if (!included) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a mount should be searched based on options
   */
  private shouldSearchMount(
    mountPoint: MountPoint,
    options: SearchOptions
  ): boolean {
    // Check if mount is in the folder to search
    if (options.folder) {
      const folderPath = options.folder.path;
      const mountPath = mountPoint.uri.path;
      
      // Only search if the mount is within the specified folder
      if (!mountPath.startsWith(folderPath) && !folderPath.startsWith(mountPath)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Simple glob pattern matching
   */
  private matchesGlob(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    const result = regex.test(path);
    
    // Debug output for testing
    if (path.includes('node_modules')) {
      console.log('Glob matching debug:');
      console.log('  Path:', path);
      console.log('  Pattern:', pattern);
      console.log('  Regex pattern:', regexPattern);
      console.log('  Regex:', regex);
      console.log('  Result:', result);
    }
    
    return result;
  }

  /**
   * Create a cache key for search results
   */
  private createSearchCacheKey(
    mountPoint: MountPoint,
    query: SearchQuery,
    options: SearchOptions
  ): string {
    return JSON.stringify({
      mountId: mountPoint.id,
      pattern: query.pattern,
      isRegExp: query.isRegExp,
      isCaseSensitive: query.isCaseSensitive,
      excludes: options.excludes,
      includes: options.includes
    });
  }

  /**
   * Clean up old cache entries
   */
  private cleanupSearchCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.searchCache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.searchCache.delete(key);
      }
    }
  }

  /**
   * Clear the search cache
   */
  clearCache(): void {
    this.searchCache.clear();
  }

  /**
   * Get search statistics
   */
  getStats(): {
    cacheSize: number;
    cacheHits: number;
    totalSearches: number;
  } {
    return {
      cacheSize: this.searchCache.size,
      cacheHits: 0, // Would need to track this
      totalSearches: 0 // Would need to track this
    };
  }
}