// src/components/attachment-list.tsx
import React from 'react';
import type { Attachment } from '@/lib/types';
import useTaskStore from '@/hooks/use-task-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link, Paperclip, Trash2, FileText, Image as ImageIcon, Video, ExternalLink, File as GenericFileIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AttachmentListProps {
  itemId: string;
  attachments: Attachment[];
  isBlocked: boolean;
  isEditing: boolean;
}

const MAX_FILE_SIZE_MB = 10; // Example limit: 10MB
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const AttachmentList: React.FC<AttachmentListProps> = ({ itemId, attachments, isBlocked, isEditing }) => {
  const { addAttachment, deleteAttachment } = useTaskStore();
  const { toast } = useToast();
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkName, setLinkName] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAddLink = () => {
    if (!linkUrl.trim()) {
      toast({ title: "Invalid Link", description: "Please enter a valid URL.", variant: "destructive" });
      return;
    }
    const name = linkName.trim() || linkUrl; // Use URL as name if name is empty
    const newAttachmentId = addAttachment(itemId, { type: 'link', name, url: linkUrl.trim() });
    if (newAttachmentId) {
      setLinkUrl('');
      setLinkName('');
      toast({ title: "Link Added", description: `"${name}" added successfully.` });
    } else {
      toast({ title: "Error", description: "Failed to add link.", variant: "destructive" });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
          title: "File Too Large",
          description: `File size cannot exceed ${MAX_FILE_SIZE_MB} MB.`,
          variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset file input
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUri = e.target?.result as string;
      if (dataUri) {
        const newAttachmentId = addAttachment(itemId, {
          type: 'file',
          name: file.name,
          dataUri: dataUri,
          fileType: file.type,
        });
        if (newAttachmentId) {
          toast({ title: "File Added", description: `"${file.name}" added successfully.` });
        } else {
          toast({ title: "Error", description: "Failed to add file.", variant: "destructive" });
        }
      } else {
          toast({ title: "Error Reading File", description: "Could not read the selected file.", variant: "destructive" });
      }
       if (fileInputRef.current) fileInputRef.current.value = ''; // Reset file input after processing
    };
    reader.onerror = () => {
        toast({ title: "Error Reading File", description: "An error occurred while reading the file.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = ''; // Reset file input on error
    }
    reader.readAsDataURL(file);
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    if (deleteAttachment(itemId, attachmentId)) {
      toast({ title: "Attachment Removed" });
    } else {
      toast({ title: "Error", description: "Failed to remove attachment.", variant: "destructive" });
    }
  };

  const getFileIcon = (fileType?: string): React.ElementType => {
    if (!fileType) return GenericFileIcon;
    if (fileType.startsWith('image/')) return ImageIcon;
    if (fileType.startsWith('video/')) return Video;
    if (fileType === 'application/pdf') return FileText;
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return FileText; // Could use a more specific icon
    if (fileType.includes('csv')) return FileText; // Could use a more specific icon
    return GenericFileIcon;
  };

  const openFile = (attachment: Attachment) => {
      if (!attachment.dataUri) return;
       try {
          const byteString = atob(attachment.dataUri.split(',')[1]);
          const mimeString = attachment.dataUri.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mimeString });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          // Revoke object URL after a delay to allow the browser to open it
           setTimeout(() => URL.revokeObjectURL(url), 100);
      } catch (error) {
          console.error("Error opening file:", error);
          toast({ title: "Error", description: "Could not open the file.", variant: "destructive" });
      }
  };


  return (
    <TooltipProvider delayDuration={100}>
      <div className="mt-2 space-y-2">
        {attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map(att => {
              const Icon = att.type === 'link' ? Link : getFileIcon(att.fileType);
              return (
                <Card key={att.id} className="p-1.5 bg-muted/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <Icon size={14} className="text-muted-foreground flex-shrink-0" />
                    {att.type === 'link' ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-primary hover:underline"
                        title={att.url}
                      >
                        {att.name} <ExternalLink size={10} className="inline-block ml-0.5" />
                      </a>
                    ) : (
                      <button
                        onClick={() => openFile(att)}
                        className="truncate text-left hover:text-primary"
                        title={`Open ${att.name} (${att.fileType || 'unknown type'})`}
                      >
                        {att.name}
                      </button>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                       <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => handleDeleteAttachment(att.id)}
                        disabled={isBlocked || isEditing}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove attachment</p>
                    </TooltipContent>
                  </Tooltip>
                </Card>
              );
            })}
          </div>
        )}

        {/* Attachment Input Area */}
        {!isBlocked && !isEditing && (
          <Card className="p-2 bg-background border-dashed">
            <div className="flex items-center gap-2 mb-1">
              <Link size={14} className="text-muted-foreground" />
              <Input
                type="text"
                placeholder="Paste or type link URL..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="h-7 text-xs flex-grow"
              />
              <Input
                type="text"
                placeholder="Optional: Link name"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                 className="h-7 text-xs w-2/5"
              />
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleAddLink} disabled={!linkUrl.trim()}>
                Add Link
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Paperclip size={14} className="text-muted-foreground" />
              <Input
                 ref={fileInputRef}
                 type="file"
                 onChange={handleFileChange}
                 className="h-7 text-xs flex-grow file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                 accept="image/*,video/*,.pdf,.csv,.xlsx,.xls,.doc,.docx,.txt" // Define acceptable file types
              />
               <span className="text-xs text-muted-foreground">Max {MAX_FILE_SIZE_MB}MB</span>
            </div>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
};

export default AttachmentList;
