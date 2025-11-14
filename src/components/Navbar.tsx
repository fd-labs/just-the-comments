import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import GitHubIcon from '@mui/icons-material/GitHub';
import ChatIcon from '@mui/icons-material/Chat';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import LightModeIcon from '@mui/icons-material/LightMode';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

interface NavbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onUploadClick: () => void;
}

export default function Navbar({ darkMode, onToggleDarkMode, onUploadClick }: NavbarProps) {
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
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
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
              Upload PDF
            </Button>
          </Box>
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
