import { useCallback, useState, useEffect, useMemo } from 'react'
import Navbar from './components/Navbar'
import type { ViewMode } from './components/Navbar'
import CommentsTable from './components/CommentsTable'
import PdfViewer from './components/PdfViewer'
import { saveAs } from 'file-saver'
import { Container, Typography, Box, Button, Fab, Select, MenuItem, Checkbox, ListItemText, FormControl, InputLabel, OutlinedInput, Menu, Snackbar, Alert, ButtonGroup, IconButton, ThemeProvider, createTheme, CssBaseline, Popover, FormControlLabel, Badge, Tooltip } from '@mui/material'
import { CloudUpload as CloudUploadIcon, KeyboardArrowUp as KeyboardArrowUpIcon, ArrowDropDown as ArrowDropDownIcon, ContentCopy as ContentCopyIcon, Save as SaveIcon, Clear as ClearIcon, FilterAlt as FilterAltIcon } from '@mui/icons-material'
import type { GridRowSelectionModel } from '@mui/x-data-grid'

import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.min.mjs";

interface CommentEntry {
  No: number;
  Page: number;
  Type: string;
  Author: string;
  Comment: string;
  MarkedText: string;
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

const COLUMN_FIELDS = ['No', 'Page', 'Type', 'MarkedText', 'Comment', 'Author', 'Modified'];

const COLUMN_LABELS: Record<string, string> = {
  No: 'No.',
  Page: 'Page',
  Type: 'Type',
  MarkedText: 'Marked Text',
  Comment: 'Comment',
  Author: 'Author',
  Modified: 'Modified',
};

const MARKUP_TYPES = new Set(['Highlight', 'StrikeOut', 'Underline', 'Squiggly']);
const SKIP_TYPES = new Set(['Link', 'Widget', 'Popup']);

function getAnnotationType(subtype: string): string {
  const typeMap: Record<string, string> = {
    'Text': 'Comment',
    'Highlight': 'Highlight',
    'StrikeOut': 'Strikethrough',
    'Underline': 'Underline',
    'Squiggly': 'Squiggly',
    'FreeText': 'Text Box',
    'Stamp': 'Stamp',
    'Ink': 'Drawing',
    'Caret': 'Caret',
    'Line': 'Line',
    'Square': 'Rectangle',
    'Circle': 'Ellipse',
    'Polygon': 'Polygon',
    'PolyLine': 'Polyline',
  };
  return typeMap[subtype] || subtype || 'Unknown';
}

function getRectsFromAnnotation(annotation: any): [number, number, number, number][] {
  const rects: [number, number, number, number][] = [];

  const quadPoints = annotation.quadPoints;
  // Convert TypedArrays (Float32Array, etc.) to regular arrays
  const qp: any[] | null = quadPoints && quadPoints.length > 0
    ? Array.from(quadPoints)
    : null;

  if (qp) {
    if (Array.isArray(qp[0])) {
      // Array of arrays
      for (const quad of qp) {
        if (quad.length >= 8) {
          if (typeof quad[0] === 'number') {
            const xs = [quad[0], quad[2], quad[4], quad[6]];
            const ys = [quad[1], quad[3], quad[5], quad[7]];
            rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
          } else if (quad[0] && typeof quad[0] === 'object' && 'x' in quad[0]) {
            const xs = quad.map((p: any) => p.x);
            const ys = quad.map((p: any) => p.y);
            rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
          }
        }
      }
    } else if (typeof qp[0] === 'number') {
      // Flat array of numbers: [x1,y1, x2,y2, ..., x4,y4, x1,y1, ...]
      for (let i = 0; i + 7 < qp.length; i += 8) {
        const xs = [qp[i], qp[i+2], qp[i+4], qp[i+6]];
        const ys = [qp[i+1], qp[i+3], qp[i+5], qp[i+7]];
        rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      }
    } else if (typeof qp[0] === 'object' && 'x' in qp[0]) {
      // Flat array of {x, y} objects, groups of 4
      for (let i = 0; i + 3 < qp.length; i += 4) {
        const pts = qp.slice(i, i + 4);
        const xs = pts.map((p: any) => p.x);
        const ys = pts.map((p: any) => p.y);
        rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      }
    }
  }

  // Fall back to rect if no quadPoints parsed
  if (rects.length === 0 && annotation.rect) {
    rects.push([annotation.rect[0], annotation.rect[1], annotation.rect[2], annotation.rect[3]]);
  }

  return rects;
}

function extractMarkedTextFromContent(
  textContent: any,
  rects: [number, number, number, number][]
): string {
  if (!textContent || !rects.length) return "";

  const matchingItems: { text: string; x: number; y: number }[] = [];

  for (const item of textContent.items) {
    if (!item.str || item.str.trim() === '') continue;

    const tx = item.transform[4];
    const ty = item.transform[5];
    const tw = item.width || 0;
    const th = item.height || (Math.abs(item.transform[3]) || 12);

    // Text item vertical extent
    const textTop = ty + th;
    const textBottom = ty;
    const textMidY = ty + th / 2;

    // Find the best matching rect (closest vertically) to avoid
    // matching a rect from a different line in multi-line annotations
    let bestRect: [number, number, number, number] | null = null;
    let bestVertDist = Infinity;

    for (const rect of rects) {
      const [rx1, ry1, rx2, ry2] = rect;
      const rectHeight = ry2 - ry1;

      let verticalMatch: boolean;
      if (rectHeight < th * 0.5) {
        const rectMidY = (ry1 + ry2) / 2;
        verticalMatch = rectMidY >= textBottom && rectMidY <= textTop;
      } else {
        verticalMatch = textMidY >= ry1 && textMidY <= ry2;
      }

      const textRight = tx + tw;
      const overlapLeft = Math.max(tx, rx1);
      const overlapRight = Math.min(textRight, rx2);
      const overlapX = (overlapRight - overlapLeft) > 0;

      if (verticalMatch && overlapX) {
        const rectMidY = (ry1 + ry2) / 2;
        const vertDist = Math.abs(textMidY - rectMidY);
        if (vertDist < bestVertDist) {
          bestVertDist = vertDist;
          bestRect = rect;
        }
      }
    }

    if (bestRect) {
      const [rx1, , rx2] = bestRect;
      let text = item.str;
      const textRight = tx + tw;
      const hOverlap = Math.min(textRight, rx2) - Math.max(tx, rx1);
      if (tw > 0 && (hOverlap < tw - 1)) {
        const startFrac = Math.max(0, (rx1 - tx) / tw);
        const endFrac = Math.min(1, (rx2 - tx) / tw);
        const startChar = Math.round(startFrac * text.length);
        const endChar = Math.floor(endFrac * text.length);
        text = text.slice(startChar, endChar);
      }
      if (text.trim()) {
        matchingItems.push({ text, x: Math.max(tx, rx1), y: ty });
      }
    }
  }

  // Sort by y descending (top-to-bottom in PDF coords) then x ascending (left-to-right)
  matchingItems.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
    return a.x - b.x;
  });

  return matchingItems.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim();
}

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
      <InputLabel>Columns</InputLabel>
      <Select
        multiple
        autoWidth
        value={selectedColumns}
        onChange={handleChange}
        input={<OutlinedInput label="Columns" />}
        renderValue={(selected) => `${selected.length - 1} selected`}
      >
        {COLUMN_FIELDS.map((field) => (
          <MenuItem key={field} value={field} disabled={field === 'Comment'}>
            <Checkbox
              checked={selectedColumns.indexOf(field) > -1}
              disabled={field === 'Comment'}
            />
            <ListItemText primary={COLUMN_LABELS[field] || field} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

// Type filter component
const DEFAULT_COLUMNS = {
  No: true,
  Page: true,
  Type: true,
  Author: false,
  Modified: false,
  MarkedText: true,
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
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [hasCommentOnly, setHasCommentOnly] = useState<boolean>(false);
  const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null);
  const [copyMenuAnchor, setCopyMenuAnchor] = useState<null | HTMLElement>(null);
  const [saveMenuAnchor, setSaveMenuAnchor] = useState<null | HTMLElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
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

  // Compute available types and filtered comments
  const availableTypes = useMemo(() => {
    const types = new Set(comments.map(c => c.Type));
    return Array.from(types).sort();
  }, [comments]);

  const filteredComments = useMemo(() => {
    let result = comments;
    if (selectedTypes.size > 0) {
      result = result.filter(c => selectedTypes.has(c.Type));
    }
    if (hasCommentOnly) {
      result = result.filter(c => c.Comment.trim() !== '');
    }
    return result;
  }, [comments, selectedTypes, hasCommentOnly]);

  const handleSelectionChange = useCallback((selectionModel: GridRowSelectionModel) => {
    if (selectionModel.type === 'include') {
      const selectedIds = Array.from(selectionModel.ids) as number[];
      setSelectedRows(selectedIds);
    } else if (selectionModel.type === 'exclude') {
      const excludedIds = new Set(selectionModel.ids);
      const selectedIds = [];
      for (let i = 0; i < filteredComments.length; i++) {
        if (!excludedIds.has(i)) {
          selectedIds.push(i);
        }
      }
      setSelectedRows(selectedIds);
    }
  }, [filteredComments.length]);

  const handleCommentEdit = useCallback((filteredIndex: number, newComment: string) => {
    // Find the original comment using the No field (1-based index into original array)
    const editedEntry = filteredComments[filteredIndex];
    if (!editedEntry) return;
    const originalIndex = editedEntry.No - 1;
    setComments(prev => {
      const updated = [...prev];
      updated[originalIndex] = { ...updated[originalIndex], Comment: newComment };
      return updated;
    });
  }, [filteredComments]);

  const saveCSV = useCallback(() => {
    // Only include visible columns, excluding UI-only columns
    const selectedFields = Object.keys(columnVisibility)
      .filter((col) => columnVisibility[col] && col !== '__check__');
    if (selectedFields.length === 0) return;

    const selectedComments = selectedRows.length > 0
      ? selectedRows.map(index => filteredComments[index]).filter(Boolean)
      : filteredComments; // If none selected, export all

    // Helper function to escape CSV field only when necessary
    const escapeCSVField = (value: string, fieldName: string) => {
      if (!value) return '';
      // Always quote comments since they're free-form text
      if (fieldName === 'Comment' || fieldName === 'MarkedText') {
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
  }, [filteredComments, fileName, selectedRows, columnVisibility]);

  // Shared function to format text content (DRY principle)
  const formatTextContent = useCallback(() => {
    // Only include visible columns, excluding UI-only columns
    const selectedFields = Object.keys(columnVisibility)
      .filter((col) => columnVisibility[col] && col !== '__check__');
    if (selectedFields.length === 0) return "";

    // Filter comments to only include selected rows
    const selectedComments = selectedRows.length > 0
      ? selectedRows.map(index => filteredComments[index]).filter(Boolean)
      : filteredComments; // If none selected, export all

    const lines = selectedComments.map((c) => {
      const metaParts = [];

      if (selectedFields.includes('Page')) {
        metaParts.push(`P${c.Page}`);
      }
      if (selectedFields.includes('Type') && c.Type) {
        metaParts.push(`[${c.Type}]`);
      }
      if (selectedFields.includes('Author') && c.Author) {
        metaParts.push(c.Author);
      }
      if (selectedFields.includes('Modified') && c.Modified) {
        metaParts.push(c.Modified);
      }

      const prefix = metaParts.length > 0 ? metaParts.join(', ') : '';

      const contentParts = [];
      if (selectedFields.includes('MarkedText') && c.MarkedText) {
        contentParts.push(`"${c.MarkedText}"`);
      }
      if (selectedFields.includes('Comment') && c.Comment) {
        contentParts.push(c.Comment);
      }

      const content = contentParts.join(' - ');

      if (prefix && content) return `${prefix} - ${content}`;
      if (content) return content;
      return prefix;
    });

    return lines.join('\n\n');
  }, [filteredComments, selectedRows, columnVisibility]);

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
      ? selectedRows.map(index => filteredComments[index]).filter(Boolean)
      : filteredComments; // If none selected, export all

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
  }, [filteredComments, selectedRows, columnVisibility]);

  const unloadFile = useCallback(() => {
    setFile(null);
    setFileName("");
    setComments([]);
    setError("");
    setLoading(false);
    setSelectedRows([]);
    setSelectedTypes(new Set());
    setHasCommentOnly(false);
    setPdfData(null);
    setViewMode('table');
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
      setPdfData(data.slice(0));
      const loadingTask = (pdfjsLib as any).getDocument({ data: data.slice(0) });
      const pdf = await loadingTask.promise;

      const found: CommentEntry[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const annots = await page.getAnnotations();

        // Pre-fetch text content for this page if any markup annotations exist
        const hasMarkup = annots.some((a: any) => MARKUP_TYPES.has(a.subtype || ""));
        let textContent: any = null;
        if (hasMarkup) {
          textContent = await page.getTextContent();
        }

        // Sort annotations by position: top-to-bottom, then left-to-right
        // PDF coordinates have origin at bottom-left, so higher Y = higher on page
        const filteredAnnots = (annots as any[])
          .filter((a: any) => {
            const subtype = a.subtype || "";
            return subtype && !SKIP_TYPES.has(subtype);
          })
          .sort((a: any, b: any) => {
            const ay = a.rect ? a.rect[3] : 0; // top edge (max Y)
            const by = b.rect ? b.rect[3] : 0;
            const ax = a.rect ? a.rect[0] : 0; // left edge
            const bx = b.rect ? b.rect[0] : 0;
            // Higher Y = higher on page, so sort descending by Y, then ascending by X
            if (Math.abs(ay - by) > 2) return by - ay;
            return ax - bx;
          });

        for (const a of filteredAnnots) {
          const subtype = a.subtype || "";

          const type = getAnnotationType(subtype);
          const isMarkup = MARKUP_TYPES.has(subtype);

          // Handle different content formats from PDF.js
          let contents = "";
          if (typeof a.contents === 'string') {
            contents = a.contents;
          } else if (a.contents && typeof a.contents === 'object') {
            if ('str' in a.contents) {
              contents = a.contents.str || "";
            } else if (a.contents.text) {
              contents = a.contents.text;
            } else if (Array.isArray(a.contents)) {
              contents = a.contents.join(' ');
            }
          } else if (a.contentsObj) {
            if (typeof a.contentsObj === 'string') {
              contents = a.contentsObj;
            } else if ('str' in a.contentsObj) {
              contents = a.contentsObj.str || "";
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

          // Extract marked text for markup annotations
          let markedText = "";
          if (isMarkup && textContent) {
            const rects = getRectsFromAnnotation(a);
            markedText = extractMarkedTextFromContent(textContent, rects);
          }

          // Include if has comment text or is a markup annotation with marked text
          if ((contents && contents.trim()) || (isMarkup && markedText)) {
            found.push({
              No: found.length + 1,
              Page: pageNum,
              Type: type,
              Author: author,
              Comment: contents.trim(),
              MarkedText: markedText,
              Modified: formatDate(mod),
            });
          }
        }
      }

      setComments(found);
      // Initialize type filter with all found types selected
      const foundTypes = new Set(found.map(c => c.Type));
      setSelectedTypes(foundTypes);
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
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          hasFile={!!file && !loading}
        />

        {/* Main Content */}
        <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex' }}>
          {/* PDF Viewer Panel */}
          {viewMode === 'split' && pdfData && file && !loading && (
            <Box
              sx={{
                width: '50%',
                minWidth: 300,
                borderRight: 1,
                borderColor: 'divider',
                overflow: 'hidden',
              }}
            >
              <PdfViewer pdfData={pdfData} fileName={fileName} />
            </Box>
          )}

          {/* Table / Content Panel */}
          <Box sx={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
          <Container maxWidth={viewMode === 'split' ? false : 'lg'} sx={{ pt: 0.5, pb: 2 }}>

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
              sx={{ 
                p: 0.5,
                color: 'error.light',
                opacity: 0.7,
                '&:hover': {
                  opacity: 1,
                  backgroundColor: 'rgba(211, 47, 47, 0.08)',
                },
              }}
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
                        Found {filteredComments.length} annotation{filteredComments.length !== 1 ? 's' : ''}
                        {filteredComments.length !== comments.length
                          ? ` (of ${comments.length} total)`
                          : ''
                        }
                        {selectedRows.length > 0
                          ? ` (${selectedRows.length} selected)`
                          : ''
                        }
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Filters">
                        <IconButton
                          onClick={(e) => setFilterAnchor(e.currentTarget)}
                          sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 40, height: 40 }}
                        >
                          <Badge color="primary" variant="dot" invisible={!hasCommentOnly && selectedTypes.size === availableTypes.length}>
                            <FilterAltIcon />
                          </Badge>
                        </IconButton>
                      </Tooltip>
                      <Popover
                        open={Boolean(filterAnchor)}
                        anchorEl={filterAnchor}
                        onClose={() => setFilterAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                      >
                        <Box sx={{ p: 2, minWidth: 200 }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={hasCommentOnly}
                                onChange={(e) => setHasCommentOnly(e.target.checked)}
                              />
                            }
                            label="Has comment only"
                          />
                          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary' }}>
                            Annotation types
                          </Typography>
                          {availableTypes.map((type) => (
                            <FormControlLabel
                              key={type}
                              control={
                                <Checkbox
                                  checked={selectedTypes.has(type)}
                                  onChange={() => {
                                    const next = new Set(selectedTypes);
                                    if (next.has(type)) {
                                      next.delete(type);
                                    } else {
                                      next.add(type);
                                    }
                                    setSelectedTypes(next);
                                  }}
                                />
                              }
                              label={type}
                              sx={{ display: 'block' }}
                            />
                          ))}
                        </Box>
                      </Popover>
                      <ColumnSelector
                        columnVisibility={columnVisibility}
                        setColumnVisibility={setColumnVisibility}
                      />
                      <ButtonGroup variant="outlined" sx={{ height: 40 }}>
                        <Tooltip title="Copy">
                          <Button
                            endIcon={<ArrowDropDownIcon />}
                            onClick={(e) => setCopyMenuAnchor(e.currentTarget)}
                            disabled={filteredComments.length === 0 || Object.values(columnVisibility).every(visible => !visible)}
                          >
                            <ContentCopyIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip title="Save">
                          <Button
                            endIcon={<ArrowDropDownIcon />}
                            onClick={(e) => setSaveMenuAnchor(e.currentTarget)}
                            disabled={filteredComments.length === 0 || Object.values(columnVisibility).every(visible => !visible)}
                          >
                            <SaveIcon />
                          </Button>
                        </Tooltip>
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
                      </Box>
                    </Box>
                    <CommentsTable
                      comments={filteredComments}
                      loading={loading}
                      onSelectionChange={handleSelectionChange}
                      onCommentEdit={handleCommentEdit}
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

      {/* Footer */}
      {!file && (
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
      )}
      </Box>
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

      </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
