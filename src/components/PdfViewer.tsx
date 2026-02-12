import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import * as pdfjsLib from 'pdfjs-dist';

interface PdfViewerProps {
  pdfData: ArrayBuffer;
  fileName: string;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;

export default function PdfViewer({ pdfData, fileName }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [scale, setScale] = useState<number>(0); // 0 = not yet calculated
  const [numPages, setNumPages] = useState<number>(0);
  const renderTasksRef = useRef<Map<number, any>>(new Map());

  // Load the PDF document
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const dataCopy = pdfData.slice(0);
        const loadingTask = (pdfjsLib as any).getDocument({ data: dataCopy });
        const pdfDoc = await loadingTask.promise;
        if (!cancelled) {
          setPdf(pdfDoc);
          setNumPages(pdfDoc.numPages);
        }
      } catch (err) {
        console.error('PdfViewer: failed to load PDF', err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pdfData]);

  // Calculate fit-to-width scale using the scrollable container's clientWidth
  const calculateFitScale = useCallback(async () => {
    if (!pdf || !scrollRef.current) return null;
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      const availableWidth = scrollRef.current.clientWidth - 32;
      return availableWidth / viewport.width;
    } catch (err) {
      console.error('PdfViewer: failed to calculate fit scale', err);
      return null;
    }
  }, [pdf]);

  // Set initial scale once PDF and container are both ready
  useEffect(() => {
    if (!pdf || !scrollRef.current) return;
    let cancelled = false;

    // Use requestAnimationFrame to ensure the container is laid out
    const raf = requestAnimationFrame(async () => {
      if (cancelled) return;
      const s = await calculateFitScale();
      if (s != null && s > 0 && !cancelled) setScale(s);
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [calculateFitScale, pdf]);

  // Render all pages — only when scale > 0 (i.e., fit scale has been calculated)
  useEffect(() => {
    if (!pdf || !pagesRef.current || scale <= 0) return;

    const pagesContainer = pagesRef.current;
    const currentScale = scale;
    let cancelled = false;

    // Cancel any in-progress render tasks immediately
    for (const [, task] of renderTasksRef.current) {
      task.cancel();
    }
    renderTasksRef.current.clear();

    // Debounce rendering to let rapid zoom clicks settle
    const timeout = setTimeout(() => {
      if (cancelled) return;
      pagesContainer.innerHTML = '';

      const renderPages = async () => {
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return; // stop if a new render was triggered
          try {
            const page = await pdf.getPage(pageNum);
            if (cancelled) return;
            const viewport = page.getViewport({ scale: currentScale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width * window.devicePixelRatio);
            canvas.height = Math.floor(viewport.height * window.devicePixelRatio);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
            canvas.style.display = 'block';
            canvas.style.marginBottom = '8px';
            canvas.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';

            pagesContainer.appendChild(canvas);

            const context = canvas.getContext('2d')!;
            context.scale(window.devicePixelRatio, window.devicePixelRatio);

            const renderTask = page.render({
              canvasContext: context,
              viewport,
            });

            renderTasksRef.current.set(pageNum, renderTask);
            await renderTask.promise;
            renderTasksRef.current.delete(pageNum);
          } catch (err: any) {
            if (err?.name !== 'RenderingCancelledException') {
              console.error(`PdfViewer: failed to render page ${pageNum}`, err);
            }
          }
        }
      };

      renderPages();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      for (const [, task] of renderTasksRef.current) {
        task.cancel();
      }
      renderTasksRef.current.clear();
    };
  }, [pdf, scale]);

  const zoomIn = () => setScale(s => Math.min(s + SCALE_STEP, MAX_SCALE));
  const zoomOut = () => setScale(s => Math.max(s - SCALE_STEP, MIN_SCALE));
  const zoomFit = async () => {
    const s = await calculateFitScale();
    if (s != null) setScale(s);
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 40,
          flexShrink: 0,
        }}
      >
        <Typography variant="body2" noWrap sx={{ flex: 1, mr: 1 }} title={fileName}>
          {fileName}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" sx={{ mr: 0.5 }}>
            {numPages} pg{numPages !== 1 ? 's' : ''} · {Math.round(scale * 100)}%
          </Typography>
          <Tooltip title="Zoom out">
            <span>
              <IconButton size="small" onClick={zoomOut} disabled={scale <= MIN_SCALE}>
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Fit to width">
            <IconButton size="small" onClick={zoomFit}>
              <FitScreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom in">
            <span>
              <IconButton size="small" onClick={zoomIn} disabled={scale >= MAX_SCALE}>
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Pages */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          overflowY: 'scroll', // Always show scrollbar to prevent layout shifts
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 2,
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'grey.900' : 'grey.200',
        }}
      >
        <div ref={pagesRef} />
      </Box>
    </Box>
  );
}
