import { useCallback, useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import CommentsTable from './components/CommentsTable'
import { saveAs } from 'file-saver'
import { Container, Typography, Box, Button, Fab, Select, MenuItem, Checkbox, ListItemText, FormControl, InputLabel, OutlinedInput, Menu, Snackbar, Alert, ButtonGroup, IconButton, ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { CloudUpload as CloudUploadIcon, KeyboardArrowUp as KeyboardArrowUpIcon, ArrowDropDown as ArrowDropDownIcon, ContentCopy as ContentCopyIcon, Save as SaveIcon, Clear as ClearIcon } from '@mui/icons-material'
import type { GridRowSelectionModel } from '@mui/x-data-grid'

import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.min.mjs";

interface CommentEntry {
  Page: number;
  Author: string;
  Comment: string;
  Modified: string;
}

function formatDate(ts?: string): string {
  if (!ts) return "";
  const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(ts);
  if (m) {
    const [_, y, mo, d, h, mi, s] = m;
    const date = new Date(
      Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    );
    return date.toISOString().replace("T", " ").replace(".000Z", "Z");
  }
  return new Date(ts).toISOString();
}

const COLUMN_FIELDS = ['Page', 'Author', 'Modified', 'Comment'];

// Column selector component
function ColumnSelector({ columnVisibility, setColumnVisibility }: {
  columnVisibility: { [key: string]: boolean },
  setColumnVisibility: (vis: { [key: string]: boolean }) => void
}) {
  const selectedColumns = Object.keys(columnVisibility).filter(key => columnVisibility[key]);

  const handleChange = (event: any) => {
    const value = event.target.value;
    const newVisibility = { ...columnVisibility };

    // Reset all to false
    Object.keys(newVisibility).forEach(key => {
      newVisibility[key] = false;
    });

    // Set selected ones to true
    value.forEach((field: string) => {
      newVisibility[field] = true;
    });

    // Always ensure "Comment" column is selected
    newVisibility.Comment = true;

    setColumnVisibility(newVisibility);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <InputLabel>Select columns</InputLabel>
      <Select
        multiple
        autoWidth
        value={selectedColumns}
        onChange={handleChange}
        input={<OutlinedInput label="Select columns" />}
        renderValue={(selected) => `${selected.length - 1} selected`}
      >
        {COLUMN_FIELDS.map((field) => (
          <MenuItem key={field} value={field} disabled={field === 'Comment'}>
            <Checkbox
              checked={selectedColumns.indexOf(field) > -1}
              disabled={field === 'Comment'}
            />
            <ListItemText primary={field} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

const DEFAULT_COLUMNS = {
  Page: true,
  Author: false,
  Modified: false,
  Comment: true,
  __check__: true, // Ensure checkbox column is always visible
};

function App() {

  const [fileName, setFileName] = useState<string>("");
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragOverlay, setIsDragOverlay] = useState<boolean>(false);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<{ [key: string]: boolean }>(DEFAULT_COLUMNS);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [noCommentsWarning, setNoCommentsWarning] = useState<boolean>(false);
  const [copyMenuAnchor, setCopyMenuAnchor] = useState<null | HTMLElement>(null);
  const [saveMenuAnchor, setSaveMenuAnchor] = useState<null | HTMLElement>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // Check localStorage or system preference
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Create theme based on dark mode
  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
    },
  });

  // Toggle dark mode and save to localStorage
  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const newMode = !prev;
      localStorage.setItem('darkMode', JSON.stringify(newMode));
      return newMode;
    });
  }, []);

  const handleSelectionChange = useCallback((selectionModel: GridRowSelectionModel) => {
    if (selectionModel.type === 'include') {
      // Use the selected ids directly
      const selectedIds = Array.from(selectionModel.ids) as number[];
      setSelectedRows(selectedIds);
    } else if (selectionModel.type === 'exclude') {
      // Calculate the inverse - all rows except the excluded ones
      const excludedIds = new Set(selectionModel.ids);
      const selectedIds = [];
      for (let i = 0; i < comments.length; i++) {
        if (!excludedIds.has(i)) {
          selectedIds.push(i);
        }
      }
      setSelectedRows(selectedIds);
    }
  }, [comments.length]);

  const saveCSV = useCallback(() => {
    // Only include visible columns, excluding UI-only columns
    const selectedFields = Object.keys(columnVisibility)
      .filter((col) => columnVisibility[col] && col !== '__check__');
    if (selectedFields.length === 0) return;

    // Filter comments to only include selected rows
    const selectedComments = selectedRows.length > 0
      ? selectedRows.map(index => comments[index]).filter(Boolean)
      : comments; // If none selected, export all

    // Helper function to escape CSV field only when necessary
    const escapeCSVField = (value: string, fieldName: string) => {
      if (!value) return '';
      // Always quote comments since they're free-form text
      if (fieldName === 'Comment') {
        return `"${value.replace(/"/g, '""')}"`;
      }
      // Only quote other fields if they contain comma, quote, or newline
      if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const rows = selectedComments.map((c) =>
      selectedFields
        .map((field) => escapeCSVField((c as any)[field]?.toString() || "", field))
        .join(",")
    );
    const csv = [selectedFields.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    // Remove file extension from filename and add _comments suffix
    const baseFileName = fileName ? fileName.replace(/\.[^/.]+$/, '') : "file";
    const filename = `${baseFileName}_comments.csv`;
    saveAs(blob, filename);
  }, [comments, fileName, selectedRows, columnVisibility]);

  // Shared function to format text content (DRY principle)
  const formatTextContent = useCallback(() => {
    // Only include visible columns, excluding UI-only columns
    const selectedFields = Object.keys(columnVisibility)
      .filter((col) => columnVisibility[col] && col !== '__check__');
    if (selectedFields.length === 0) return "";

    // Filter comments to only include selected rows
    const selectedComments = selectedRows.length > 0
      ? selectedRows.map(index => comments[index]).filter(Boolean)
      : comments; // If none selected, export all

    const lines = selectedComments.map((c) => {
      const parts = [];

      // Add page if selected
      if (selectedFields.includes('Page')) {
        parts.push(`P${c.Page}`);
      }

      // Add author if selected
      if (selectedFields.includes('Author') && c.Author) {
        parts.push(c.Author);
      }

      // Add modified if selected
      if (selectedFields.includes('Modified') && c.Modified) {
        parts.push(c.Modified);
      }

      // Format the prefix (everything before the comment)
      const prefix = parts.length > 0 ? parts.join(', ') : '';

      // Add comment with appropriate formatting
      if (selectedFields.includes('Comment')) {
        if (prefix) {
          return `${prefix} - ${c.Comment}`;
        } else {
          return c.Comment;
        }
      } else {
        return prefix;
      }
    });

    return lines.join('\n\n');
  }, [comments, selectedRows, columnVisibility]);

  const saveTXT = useCallback(() => {
    const text = formatTextContent();
    if (!text) return;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });

    // Remove file extension from filename and add _comments suffix
    const baseFileName = fileName ? fileName.replace(/\.[^/.]+$/, '') : "file";
    const filename = `${baseFileName}_comments.txt`;
    saveAs(blob, filename);
  }, [formatTextContent, fileName]);

  const copyToClipboard = useCallback(async () => {
    const text = formatTextContent();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // For unsupported browsers, show the text in an alert as fallback
      alert('Your browser doesn\'t support clipboard access. Here\'s the text to copy manually:\n\n' + text);
    }
  }, [formatTextContent]);

  const copyCSVToClipboard = useCallback(async () => {
    // Only include visible columns, excluding UI-only columns
    const selectedFields = Object.keys(columnVisibility)
      .filter((col) => columnVisibility[col] && col !== '__check__');
    if (selectedFields.length === 0) return;

    // Filter comments to only include selected rows
    const selectedComments = selectedRows.length > 0
      ? selectedRows.map(index => comments[index]).filter(Boolean)
      : comments; // If none selected, export all

    // Helper function to properly escape TSV fields with newlines
    const escapeTSVField = (value: string) => {
      if (!value) return '""'; // Empty quoted field
      // Always quote fields, and preserve actual newlines for Excel
      return `"${value.replace(/"/g, '""')}"`;
    };

    // Create TSV with proper newline handling
    const header = selectedFields.map(field => escapeTSVField(field)).join("\t");
    const rows = selectedComments.map((c) =>
      selectedFields
        .map((field) => escapeTSVField((c as any)[field]?.toString() || ""))
        .join("\t")
    );
    const tsv = [header, ...rows].join("\n");

    try {
      // Use simple TSV approach with proper quoting for multi-line content
      await navigator.clipboard.writeText(tsv);
      setCopySuccess(true);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // For unsupported browsers, show the text in an alert as fallback
      alert('Your browser doesn\'t support clipboard access. Here\'s the data to copy manually:\n\n' + tsv);
    }
  }, [comments, selectedRows, columnVisibility]);

  const unloadFile = useCallback(() => {
    setFile(null);
    setFileName("");
    setComments([]);
    setError("");
    setLoading(false);
    setSelectedRows([]);
    // Keep column visibility settings intact
  }, []);

  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) return;

    setFile(file);
    setError("");
    setComments([]);
    setLoading(true);
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const loadingTask = (pdfjsLib as any).getDocument({ data });
      const pdf = await loadingTask.promise;

      const found: CommentEntry[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const annots = await page.getAnnotations();
        for (const a of annots as any[]) {
          const subtype = a.subtype || a.annotationType || "";

          // Only process text annotations
          if (subtype !== 'Text') continue;

          // Handle different content formats from PDF.js
          let contents = "";
          if (typeof a.contents === 'string') {
            contents = a.contents;
          } else if (a.contents && typeof a.contents === 'object') {
            // Handle object content (like rich text)
            if (a.contents.str) {
              contents = a.contents.str;
            } else if (a.contents.text) {
              contents = a.contents.text;
            } else if (Array.isArray(a.contents)) {
              contents = a.contents.join(' ');
            } else {
              contents = JSON.stringify(a.contents);
            }
          } else if (a.contentsObj) {
            // Fallback to contentsObj
            if (typeof a.contentsObj === 'string') {
              contents = a.contentsObj;
            } else if (a.contentsObj.str) {
              contents = a.contentsObj.str;
            } else {
              contents = JSON.stringify(a.contentsObj);
            }
          }

          // Extract author from various possible properties
          let author = "";
          if (a.titleObj && a.titleObj.str) {
            author = a.titleObj.str;
          } else if (a.title) {
            author = a.title;
          } else if (a.T) {
            // T is the PDF spec field for title/author
            author = typeof a.T === 'string' ? a.T : (a.T.str || "");
          } else if (a.user) {
            author = a.user;
          } else if (a.author) {
            author = a.author;
          } else if (a.userName) {
            author = a.userName;
          }

          const mod = a.modificationDate || a.modDate || a.modified || "";


          if (contents && contents.trim()) {
            found.push({
              Page: pageNum,
              Author: author,
              Comment: contents.trim(),
              Modified: formatDate(mod),
            });
          }
        }
      }

      setComments(found);
      if (found.length === 0) {
        setNoCommentsWarning(true);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to parse PDF.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Window-level drag and drop handlers for overlay
  useEffect(() => {
    let dragCounter = 0;

    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragOverlay(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragOverlay(false);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragOverlay(false);

      const droppedFile = e.dataTransfer?.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleFileSelect]);

  // Scroll to top functionality
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx';
    input.onchange = (e) => {
      const selectedFile = (e.target as HTMLInputElement).files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    };
    input.click();
  };


  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Navbar 
          darkMode={darkMode} 
          onToggleDarkMode={toggleDarkMode}
          onUploadClick={handleClick}
        />

        {/* Main Content - Scrollable */}
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Container maxWidth="md" sx={{ pt: 0.5, pb: 2 }}>

        {/* Filename display */}
        {file && (
          <Box sx={{ mt: 2, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="textSecondary">
              {fileName}
            </Typography>
            <IconButton
              size="small"
              onClick={unloadFile}
              title="Clear file"
              sx={{ p: 0.5 }}
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        {loading ? (
          /* Loading State - only affects content area below toolbar */
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="textSecondary">
              Extracting comments from {file?.name}
            </Typography>
          </Box>
        ) : (
          <>
            {/* Content Area - Upload UI OR Table */}
            {!file && comments.length === 0 ? (
              /* Initial Upload UI */
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body1" sx={{ mb: 4, mt: 5, fontWeight: 500 }}>
                  📝 Extract comments from your PDF documents. 🔒 100% private.{' '}
                  <Box
                    component="a"
                    href="https://github.com/fd-labs/just-the-comments#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      color: 'primary.main',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' }
                    }}
                  >
                    Learn more.
                  </Box>
                </Typography>
                <Box 
                  sx={{ 
                    border: '2px dashed',
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 6,
                    backgroundColor: 'action.hover',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      backgroundColor: 'action.selected',
                    }
                  }}
                  onClick={handleClick}
                >
                  <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" color="textPrimary" sx={{ mb: 1 }}>
                    Upload a PDF document
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    or drag and drop anywhere on this page
                  </Typography>
                </Box>
              </Box>
            ) : (
              /* Results/Table Area */
              <>
                {/* Error Display */}
                {error && (
                  <Box sx={{ mt: 3, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
                    <Typography color="error">{error}</Typography>
                  </Box>
                )}

                {/* Results Section */}
                {file && (
                  <Box sx={{ mt: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">
                        Found {comments.length} comment{comments.length !== 1 ? 's' : ''}
                        {selectedRows.length > 0
                          ? ` (${selectedRows.length} selected)`
                          : ''
                        }
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ButtonGroup variant="outlined">
                        <Button
                          startIcon={<ContentCopyIcon />}
                          endIcon={<ArrowDropDownIcon />}
                          onClick={(e) => setCopyMenuAnchor(e.currentTarget)}
                          disabled={comments.length === 0 || Object.values(columnVisibility).every(visible => !visible)}
                        >
                          Copy
                        </Button>
                        <Button
                          startIcon={<SaveIcon />}
                          endIcon={<ArrowDropDownIcon />}
                          onClick={(e) => setSaveMenuAnchor(e.currentTarget)}
                          disabled={comments.length === 0 || Object.values(columnVisibility).every(visible => !visible)}
                        >
                          Save
                        </Button>
                      </ButtonGroup>
                      <Menu 
                        anchorEl={copyMenuAnchor} 
                        open={Boolean(copyMenuAnchor)} 
                        onClose={() => setCopyMenuAnchor(null)}
                      >
                        <MenuItem onClick={() => { copyToClipboard(); setCopyMenuAnchor(null); }}>
                          Copy as text
                        </MenuItem>
                        <MenuItem onClick={() => { copyCSVToClipboard(); setCopyMenuAnchor(null); }}>
                          Copy as table
                        </MenuItem>
                      </Menu>
                      <Menu 
                        anchorEl={saveMenuAnchor} 
                        open={Boolean(saveMenuAnchor)} 
                        onClose={() => setSaveMenuAnchor(null)}
                      >
                        <MenuItem onClick={() => { saveTXT(); setSaveMenuAnchor(null); }}>
                          Save as text file
                        </MenuItem>
                        <MenuItem onClick={() => { saveCSV(); setSaveMenuAnchor(null); }}>
                          Save as CSV file
                        </MenuItem>
                      </Menu>
                      
                      <ColumnSelector
                        columnVisibility={columnVisibility}
                        setColumnVisibility={setColumnVisibility}
                      />
                      </Box>
                    </Box>
                    <CommentsTable
                      comments={comments}
                      loading={loading}
                      onSelectionChange={handleSelectionChange}
                      columnVisibility={columnVisibility}
                      setColumnVisibility={setColumnVisibility}
                    />
                  </Box>
                )}
              </>
            )}

            {/* Full-screen drag overlay */}
            {isDragOverlay && (
              <Box
                sx={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                  backdropFilter: 'blur(4px)',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '4px dashed #1976d2',
                  boxSizing: 'border-box',
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 80, color: '#1976d2', mb: 2 }} />
                <Typography variant="h4" color="primary" sx={{ fontWeight: 600 }}>
                  Drop your PDF here
                </Typography>
                <Typography variant="body1" color="textSecondary" sx={{ mt: 1 }}>
                  Release to upload and extract comments
                </Typography>
              </Box>
            )}
          </>
        )}

      </Container>

      {/* Scroll to top button */}
      {showScrollTop && (
        <Fab
          color="primary"
          size="medium"
          onClick={scrollToTop}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
          }}
        >
          <KeyboardArrowUpIcon />
        </Fab>
      )}

      {/* Copy success toast */}
      <Snackbar
        open={copySuccess}
        autoHideDuration={3000}
        onClose={() => setCopySuccess(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: 8 }} // Add margin-top to clear the navbar
      >
        <Alert
          onClose={() => setCopySuccess(false)}
          severity="success"
          variant='filled'
          sx={{ width: '100%' }}
        >
          Copied to clipboard!
        </Alert>
      </Snackbar>

      {/* No comments warning toast */}
      <Snackbar
        open={noCommentsWarning}
        autoHideDuration={5000}
        onClose={() => setNoCommentsWarning(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: 8 }} // Add margin-top to clear the navbar
      >
        <Alert
          onClose={() => setNoCommentsWarning(false)}
          severity="error"
          variant='filled'
          sx={{ width: '100%' }}
        >
          No comments found. The PDF may have flattened annotations or no comments were added.
        </Alert>
      </Snackbar>

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          mt: 8,
          py: 3,
          px: 2,
          backgroundColor: 'background.paper'
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="textSecondary">
              Made with ❤️ by{' '}
              <Box
                component="a"
                href="https://github.com/fd-labs"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'primary.main',
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' }
                }}
              >
                Flow Direction Labs
              </Box>
              {' • '}
              <Box
                component="a"
                href="https://github.com/fd-labs/just-the-comments"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'primary.main',
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' }
                }}
              >
                View Source
              </Box>
            </Typography>
          </Box>
        </Container>
      </Box>
      </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
