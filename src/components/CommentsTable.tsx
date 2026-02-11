import Box from '@mui/material/Box';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { useMemo, useCallback, useEffect } from 'react';

interface CommentEntry {
  Page: number;
  Type: string;
  Author: string;
  Comment: string;
  MarkedText: string;
  Modified: string;
}

interface CommentsTableProps {
  comments: CommentEntry[];
  loading?: boolean;
  onSelectionChange?: (selectionModel: GridRowSelectionModel) => void;
  columnVisibility: { [key: string]: boolean };
  setColumnVisibility: (vis: { [key: string]: boolean }) => void;
}

const columns: GridColDef<CommentEntry>[] = [
  { 
    field: 'Page', 
    width: 90,
    type: 'number'
  },
  {
    field: 'Type',
    headerName: 'Type',
    width: 130,
  },
  {
    field: 'MarkedText',
    headerName: 'Marked Text',
    width: 250,
    renderCell: (params) => (
      <Box sx={{ 
        whiteSpace: 'normal', 
        wordWrap: 'break-word', 
        lineHeight: 1.4,
        fontStyle: 'italic',
      }}>
        {params.value}
      </Box>
    ),
  },
  {
    field: 'Comment',
    flex: 1,
    minWidth: 300,
    hideable: false, // Prevent hiding the Comment column
    renderCell: (params) => (
      <Box sx={{ 
        whiteSpace: 'normal', 
        wordWrap: 'break-word', 
        lineHeight: 1.4,
      }}>
        {params.value}
      </Box>
    ),
  },
  {
    field: 'Author',
    width: 150,
  },
  {
    field: 'Modified',
    width: 180,
  },
];

export default function CommentsTable({ comments, loading = false, onSelectionChange, columnVisibility, setColumnVisibility }: CommentsTableProps) {
  // Inject global CSS to hide checkbox selection in column management
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .MuiDataGrid-columnsManagement .MuiDataGrid-columnsManagementRow:first-child,
      .MuiDataGrid-columnsManagement > :first-child {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Memoize row data to prevent unnecessary re-computation
  const rowsWithId = useMemo(() => 
    comments.map((comment, index) => ({
      id: index,
      ...comment,
    })), [comments]
  );

  const handleSelectionChange = useCallback((selectionModel: GridRowSelectionModel) => {
    onSelectionChange?.(selectionModel);
  }, [onSelectionChange]);

  // Handle column visibility changes from DataGrid's native controls
  const handleColumnVisibilityChange = useCallback((model: any) => {
    // Ensure Comment column and checkbox column are always visible
    const updatedModel = { 
      ...model, 
      Comment: true,
      __check__: true // This is the internal field name for the checkbox column
    };
    setColumnVisibility(updatedModel);
  }, [setColumnVisibility]);

  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid
        rows={rowsWithId}
        columns={columns}
        loading={loading}
        getRowHeight={() => 'auto'}
        checkboxSelection
        onRowSelectionModelChange={handleSelectionChange}
        onColumnVisibilityModelChange={handleColumnVisibilityChange}
        disableRowSelectionOnClick
        hideFooter
        disableVirtualization={false}
        columnVisibilityModel={columnVisibility}
        sx={{
          '& .MuiDataGrid-cell': {
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            display: 'flex',
            alignItems: 'flex-start',
            paddingTop: '12px',
            paddingBottom: '12px',
          },
          '& .MuiDataGrid-row': {
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
          },
          // Disable checkbox animations for faster response
          '& .MuiCheckbox-root': {
            transition: 'none !important',
            padding: '0 !important', // Remove padding that creates the circular background space
            '& .MuiSvgIcon-root': {
              transition: 'none !important',
            },
            // Remove the circular background entirely
            '&:before': {
              display: 'none',
            },
            '&:after': {
              display: 'none', 
            },
            // Add instant visual feedback on mousedown
            '&:active .MuiSvgIcon-root': {
            //   transform: 'scale(0.9)',
              opacity: '0.7',
            },
          },
          // Also disable any checkbox ripple effects
          '& .MuiCheckbox-root .MuiTouchRipple-root': {
            display: 'none',
          },
          // Remove the circular hover background
          '& .MuiCheckbox-root:hover': {
            backgroundColor: 'transparent !important',
          },
          // Optimize row rendering performance
          '& .MuiDataGrid-virtualScroller': {
            // Enable hardware acceleration
            transform: 'translateZ(0)',
          },
          // Reduce reflow on selection changes
          '& .MuiDataGrid-row.Mui-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.08) !important',
            transition: 'none !important',
          },
        }}
      />
    </Box>
  );
}
