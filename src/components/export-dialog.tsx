// src/components/export-dialog.tsx
'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import useTaskStore from '@/hooks/use-task-store';
import { exportToCSV, exportToJSON, exportToPlainText, triggerDownload } from '@/lib/export-utils'; // Assume these utils exist
import { useToast } from '@/hooks/use-toast';

interface ExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = 'csv' | 'json' | 'text';

const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onOpenChange }) => {
  const { getRawTaskLists } = useTaskStore(); // Get raw data for export
  const { toast } = useToast();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const taskLists = getRawTaskLists(); // Fetch the data
      let fileContent = '';
      let fileName = `dayflow-export-${new Date().toISOString().split('T')[0]}`;
      let mimeType = '';

      switch (selectedFormat) {
        case 'csv':
          fileContent = exportToCSV(taskLists);
          fileName += '.csv';
          mimeType = 'text/csv;charset=utf-8;';
          break;
        case 'json':
          fileContent = exportToJSON(taskLists);
          fileName += '.json';
          mimeType = 'application/json;charset=utf-8;';
          break;
        case 'text':
          fileContent = exportToPlainText(taskLists);
          fileName += '.txt';
          mimeType = 'text/plain;charset=utf-8;';
          break;
        default:
          throw new Error('Invalid export format');
      }

      triggerDownload(fileContent, fileName, mimeType);
      toast({ title: 'Export Successful', description: `Data exported as ${fileName}` });
      onOpenChange(false); // Close dialog on success
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Project Data</DialogTitle>
          <DialogDescription>
            Choose the format in which you want to export your tasks and lists.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <RadioGroup
            defaultValue={selectedFormat}
            onValueChange={(value: ExportFormat) => setSelectedFormat(value)}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="json" id="r-json" />
              <Label htmlFor="r-json">JSON</Label>
              <span className="text-xs text-muted-foreground ml-auto">(Recommended for backup/import)</span>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="csv" id="r-csv" />
              <Label htmlFor="r-csv">CSV</Label>
              <span className="text-xs text-muted-foreground ml-auto">(Spreadsheet compatible, basic data)</span>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="text" id="r-text" />
              <Label htmlFor="r-text">Plain Text</Label>
               <span className="text-xs text-muted-foreground ml-auto">(Human readable)</span>
            </div>
          </RadioGroup>
        </div>
        <DialogFooter>
           <DialogClose asChild>
             <Button type="button" variant="outline" disabled={isExporting}>
               Cancel
             </Button>
          </DialogClose>
          <Button type="button" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isExporting ? 'Exporting...' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
