import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';

import GitHubIcon from '@mui/icons-material/GitHub';
import ChatIcon from '@mui/icons-material/Chat';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import LightModeIcon from '@mui/icons-material/LightMode';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VerticalSplitIcon from '@mui/icons-material/VerticalSplit';
import TableRowsIcon from '@mui/icons-material/TableRows';

import ClearIcon from '@mui/icons-material/Clear';

export type ViewMode = 'table' | 'split';

interface NavbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onUploadClick: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hasFile: boolean;
  fileName: string;
  onUnloadFile: () => void;
}

export default function Navbar({ darkMode, onToggleDarkMode, onUploadClick, viewMode, onViewModeChange, hasFile, fileName, onUnloadFile }: NavbarProps) {
  return (
    <Box>
      <AppBar 
        position="static" 
        elevation={0}
        sx={{ 
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, position: 'relative' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box 
              component="a" 
              href="/"
              sx={{ 
                display: 'flex', 
                alignItems: 'center',
                textDecoration: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <ChatIcon sx={{ mr: 1, fontSize: 28 }} />
              <Typography variant="h6">
                Just the Comments
              </Typography>
            </Box>
            {hasFile && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  onClick={onUploadClick}
                  title="Your files never leave your browser"
                  size="small"
                  sx={{ 
                    ml: 2,
                    color: 'white',
                    borderColor: 'white',
                    '&:hover': {
                      borderColor: 'white',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)'
                    }
                  }}
                >
                  Upload new PDF
                </Button>
                <Typography variant="body2" sx={{ ml: 1, opacity: 0.7 }}>
                  (or drag &amp; drop anywhere)
                </Typography>
              </>
            )}
          </Box>
          {hasFile && (
            <Box sx={{ display: 'flex', alignItems: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                {fileName}
              </Typography>
              <IconButton
                size="small"
                onClick={onUnloadFile}
                title="Clear file"
                sx={{
                  ml: 0.5,
                  p: 0.5,
                  color: 'rgba(255,255,255,0.7)',
                  '&:hover': {
                    color: 'error.light',
                    backgroundColor: 'rgba(211, 47, 47, 0.15)',
                  },
                }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
          {hasFile && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_e, val) => { if (val) onViewModeChange(val); }}
              size="small"
              sx={{
                mr: 2,
                '& .MuiToggleButton-root': {
                  color: 'rgba(255, 255, 255, 0.7)',
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  },
                  '&.Mui-selected': {
                    color: 'white',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    },
                  },
                },
              }}
            >
              <ToggleButton value="table" aria-label="Table only">
                <TableRowsIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="split" aria-label="Table and PDF split view">
                <VerticalSplitIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
            <Box component="span" sx={{ mr: 0.5 }}>🔒</Box>
            <Box
              component="a"
              href="https://github.com/fd-labs/just-the-comments?tab=readme-ov-file#-privacy--security"
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: 'inherit',
                textDecoration: 'none',
                fontSize: '0.875rem',
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              100% private
            </Box>
          </Box>
          <IconButton
            color="inherit"
            onClick={onToggleDarkMode}
            aria-label="Toggle dark mode"
            sx={{ mr: 1 }}
          >
            {darkMode ? <LightModeIcon /> : <BedtimeIcon />}
          </IconButton>
          <IconButton
            color="inherit"
            component="a"
            href="https://github.com/fd-labs/just-the-comments"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            sx={{ mr: 1 }}
          >
            <GitHubIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
    </Box>
  );
}
