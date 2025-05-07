// src/components/subtask-item.tsx
import React from 'react';
import type { Subtask, Priority, Status, Activity } from '@/lib/types';
import useTaskStore from '@/hooks/use-task-store';
import ActivityItem from './activity-item';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'; // Import Dropdown components
import { GripVertical, Trash2, Plus, Calendar as CalendarIcon, CheckSquare, Square, Lock, PenLine, Unlock, CheckCircle2, Clock, Play, Check, CircleDotDashed, CircleOff, Paperclip } from 'lucide-react'; // Added status icons, Paperclip
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import AttachmentList from './attachment-list'; // Import AttachmentList

interface SubtaskItemProps {
  subtask: Subtask;
  isParentDragDisabled: boolean; // Renamed - Indicates if parent (task) blocks dragging
  isSequenceLocked: boolean; // New prop for parent task's sequence lock
}

// Priority styling using theme variables
const priorityStyles: Record<Priority, { border: string; bg: string; text?: string }> = {
  high: { border: 'border-destructive', bg: 'bg-destructive/10', text: 'text-destructive-foreground' },
  medium: { border: 'border-primary', bg: 'bg-primary/10', text: 'text-primary-foreground' },
  low: { border: 'border-success', bg: 'bg-success/10', text: 'text-success-foreground' },
};

// Status styles for text dimming/strikethrough
const textStatusStyles: Record<Status, string> = {
    todo: 'opacity-100',
    started: 'opacity-100',
    inprogress: 'opacity-90',
    done: 'opacity-60 line-through',
};

// Status styles for icon/badge coloring
const statusDisplayInfo: Record<Status, { icon: React.ElementType; color: string; label: string }> = {
    todo: { icon: CircleOff, color: 'text-muted-foreground', label: 'To Do' },
    started: { icon: Play, color: 'text-started', label: 'Started' },
    inprogress: { icon: CircleDotDashed, color: 'text-inprogress', label: 'In Progress'},
    done: { icon: Check, color: 'text-success', label: 'Done' },
}


const SubtaskItem: React.FC<SubtaskItemProps> = ({ subtask, isParentDragDisabled, isSequenceLocked }) => {
  const { updateSubtask, deleteSubtask, addActivity, findItem, canStartItem, canChangeStatus } = useTaskStore();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedName, setEditedName] = React.useState(subtask.name);
  const [editedDescription, setEditedDescription] = React.useState(subtask.description || '');
  const [isExpanded, setIsExpanded] = React.useState(false);
  const descriptionTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = React.useState<'name' | 'description' | null>(null);
  const [showAttachments, setShowAttachments] = React.useState(false); // State for attachments


   React.useEffect(() => {
     if (!isEditing) {
         setEditedName(subtask.name);
         setEditedDescription(subtask.description || '');
     }
   }, [subtask.name, subtask.description, isEditing]);


  const isBlocked = !canStartItem(subtask.id); // Subtask's own blocked status
  // Combine drag disabled reasons: parent lock, parent drag disable, self editing, self blocked
  const dragDisabledCombined = isSequenceLocked || isParentDragDisabled || isEditing || isBlocked;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
      id: subtask.id,
      data: { type: 'subtask', item: subtask },
      disabled: dragDisabledCombined, // Use the combined flag
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
    zIndex: isDragging ? 10 : undefined,
  };

 const handleStatusChange = async (newStatus: Status) => {
     if (newStatus === subtask.status) return;

     const allowed = canChangeStatus(subtask.id, newStatus);
     if (allowed !== true) {
         toast({
             title: "Status Change Blocked",
             description: allowed,
             variant: "destructive",
             duration: 5000,
         });
         return;
     }

     const result = updateSubtask(subtask.id, { status: newStatus });

      if (typeof result === 'string') { // Error occurred during update
          toast({
              title: "Update Error",
              description: result,
              variant: "destructive",
          });
      } else if (result === true) {
         // Optional: Success toast
         // toast({ title: "Status Updated", description: `Subtask marked as ${statusDisplayInfo[newStatus].label}.` });
      }
   };

    const handleSetActualCompletionDate = () => {
       // This function is less relevant now as 'done' status handles completion date.
        const allowed = canChangeStatus(subtask.id, 'done');
        if (allowed !== true) {
           toast({ title: "Action Blocked", description: allowed, variant: "destructive" });
           return;
        }
        if (subtask.status !== 'done') {
             const result = updateSubtask(subtask.id, { status: 'done' });
             if (typeof result === 'string') {
                toast({ title: "Update Error", description: result, variant: "destructive" });
             }
       }
   };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditedName(e.target.value);
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditedDescription(e.target.value);
       if (descriptionTextareaRef.current) {
         descriptionTextareaRef.current.style.height = 'auto';
         descriptionTextareaRef.current.style.height = `${descriptionTextareaRef.current.scrollHeight}px`;
       }
    };


    const saveChanges = (fieldToSave?: 'name' | 'description') => {
        const trimmedName = editedName.trim();
        const trimmedDescription = editedDescription.trim();
        const updates: Partial<Subtask> = {};
        let nameChanged = false;
        let descriptionChanged = false;

        // Check name for changes
        if (fieldToSave === 'name' || !fieldToSave) {
            if (trimmedName && trimmedName !== subtask.name) {
                updates.name = trimmedName;
                nameChanged = true;
            } else if (!trimmedName && subtask.name) {
                 if(fieldToSave !== 'description') setEditedName(subtask.name);
            }
        }

         // Check description for changes
        if (fieldToSave === 'description' || !fieldToSave) {
            const currentDesc = subtask.description || '';
            if (trimmedDescription !== currentDesc) {
                updates.description = trimmedDescription || undefined;
                descriptionChanged = true;
            }
        }

        if (nameChanged || descriptionChanged) {
            // updateSubtask handles history and lastEditedDate internally
            const result = updateSubtask(subtask.id, updates);
             if (typeof result === 'string') {
                toast({ title: "Update Error", description: result, variant: "destructive" });
                 // Revert local state on error
                 if (nameChanged) setEditedName(subtask.name);
                 if (descriptionChanged) setEditedDescription(subtask.description || '');
            }
        }

         // Only exit editing mode if saving all or blurring out
         if (!fieldToSave) {
             setIsEditing(false);
             setEditingField(null);
             if (descriptionTextareaRef.current) {
               descriptionTextareaRef.current.style.height = 'auto'; // Reset height
             }
         }
    };


    const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const field = e.target.dataset.element as 'name' | 'description';
        setEditingField(field);
         if (field === 'description' && descriptionTextareaRef.current) {
            descriptionTextareaRef.current.style.height = 'auto';
            descriptionTextareaRef.current.style.height = `${descriptionTextareaRef.current.scrollHeight}px`;
         }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const currentTarget = e.currentTarget;
        requestAnimationFrame(() => {
           const relatedTarget = document.activeElement;
           const parentContainer = currentTarget.closest('[data-editing-container="true"]');
           if (!parentContainer || !parentContainer.contains(relatedTarget)) {
               saveChanges(); // Save all changes if focus moves outside
           }
        });
     };


    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const fieldName = (e.target as HTMLElement).dataset.element as 'name' | 'description' | undefined;
        if (e.key === 'Enter' && !(e.shiftKey && fieldName === 'description') && e.nativeEvent.isComposing === false) {
           e.preventDefault();
           if (fieldName === 'name' && descriptionTextareaRef.current) {
               saveChanges('name'); // Save name only
               descriptionTextareaRef.current.focus(); // Move to description
               descriptionTextareaRef.current.select();
           } else {
               saveChanges(); // Save all and exit
               (e.target as HTMLElement).blur();
               setIsEditing(false);
               setEditingField(null);
           }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditedName(subtask.name);
            setEditedDescription(subtask.description || '');
            setIsEditing(false);
            setEditingField(null);
            (e.target as HTMLElement).blur();
             if (descriptionTextareaRef.current) {
               descriptionTextareaRef.current.style.height = 'auto'; // Reset height
            }
        }
    };

    const startEditing = (fieldToFocus: 'name' | 'description' = 'name') => {
        if (isEditing) return;

        setIsEditing(true);
        setTimeout(() => {
            if (fieldToFocus === 'name' && nameInputRef.current) {
                nameInputRef.current.focus();
                nameInputRef.current.select();
                setEditingField('name');
            } else if (fieldToFocus === 'description' && descriptionTextareaRef.current) {
                descriptionTextareaRef.current.focus();
                descriptionTextareaRef.current.select();
                setEditingField('description');
                descriptionTextareaRef.current.style.height = 'auto';
                descriptionTextareaRef.current.style.height = `${descriptionTextareaRef.current.scrollHeight}px`;
            }
        }, 0);
    };

    const handleViewAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
         if (target.closest('button, a, input, textarea, [role="combobox"], [role="menu"], [role="dialog"], [data-no-edit-click="true"]')) {
            return; // Ignore interactive elements
        }
        if (isEditing) return;

        // Determine if clicking on name or description area
        if (target.closest('[data-description-display="true"]')) {
             startEditing('description');
        } else {
            startEditing('name');
        }
    };

     const handleEditIconClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isEditing) {
            startEditing('name');
        } else {
             if (nameInputRef.current && editingField !== 'name') {
                nameInputRef.current.focus();
                nameInputRef.current.select();
             }
        }
    };

    const handleDateChange = (field: 'creationDate' | 'expectedCompletionDate') => (date: Date | undefined) => {
        if (date) {
            const parentTaskResult = findItem(subtask.parentId);
            if (!parentTaskResult || parentTaskResult.type !== 'task') return;
            const parentTask = parentTaskResult.item as import('@/lib/types').Task;

            let updatePayload: Partial<Subtask> = {};

            if (field === 'expectedCompletionDate') {
                // Ensure >= creationDate and <= parent's expectedCompletionDate
                if (date < subtask.creationDate) {
                     toast({ title: "Invalid Date", description: "Expected completion date cannot be earlier than creation date.", variant: "destructive" }); return;
                }
                if (parentTask.expectedCompletionDate && date > parentTask.expectedCompletionDate) {
                     toast({ title: "Invalid Date", description: "Subtask expected completion date cannot be later than parent task's. Adjusting.", variant: "default" });
                     date = parentTask.expectedCompletionDate;
                }
                updatePayload.expectedCompletionDate = date;
            } else if (field === 'creationDate') {
                 // Ensure <= expectedCompletionDate and >= parent's creationDate
                if (date > subtask.expectedCompletionDate) {
                     toast({ title: "Invalid Date", description: "Creation date cannot be later than expected completion date. Adjusting expected date.", variant: "default" });
                     updatePayload.creationDate = date;
                     updatePayload.expectedCompletionDate = date;
                } else if (parentTask.creationDate && date < parentTask.creationDate) {
                     toast({ title: "Invalid Date", description: "Subtask creation date cannot be earlier than parent task's. Adjusting.", variant: "default" });
                     date = parentTask.creationDate;
                     updatePayload.creationDate = date;
                     // Also check if expected date needs adjustment
                     if (subtask.expectedCompletionDate < date) {
                         updatePayload.expectedCompletionDate = date;
                     }
                } else {
                     updatePayload.creationDate = date;
                }
            }

            if (Object.keys(updatePayload).length > 0) {
                 const result = updateSubtask(subtask.id, updatePayload);
                 if (typeof result === 'string') {
                    toast({ title: "Update Error", description: result, variant: "destructive" });
                 }
            }
        }
    };


  const handlePriorityChange = (value: Priority) => {
    updateSubtask(subtask.id, { priority: value });
  };

   const handleSerialCompletionChange = (checked: boolean | 'indeterminate') => {
        if (checked !== 'indeterminate') {
           updateSubtask(subtask.id, { serialCompletionMandatory: checked });
        }
    };

    const handleSequenceMandatoryChange = (checked: boolean | 'indeterminate') => {
        if (checked !== 'indeterminate') {
           updateSubtask(subtask.id, { sequenceMandatory: checked });
        }
    };


  const handleAddNewActivity = () => {
    addActivity(subtask.id, 'New Activity');
    if (!isExpanded) {
        setIsExpanded(true);
    }
  };

  const activityIds = React.useMemo(() => subtask.activities.map(a => a.id), [subtask.activities]);
  const priorityStyle = priorityStyles[subtask.priority];
  const CurrentStatusIcon = statusDisplayInfo[subtask.status].icon;
  const currentStatusColor = statusDisplayInfo[subtask.status].color;
  const currentTextStatusStyle = textStatusStyles[subtask.status];

  const renderHeaderContent = () => {
    if (isEditing) {
      return (
        <div className="flex flex-col gap-1 w-full" data-editing-container="true">
            <Input
              ref={nameInputRef}
              data-element="name"
              value={editedName}
              onChange={handleNameChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className={cn("text-base font-semibold h-9 border-accent focus-visible:ring-accent", currentTextStatusStyle)}
              disabled={isBlocked} // Keep disabled logic if needed
            />
            <Textarea
              ref={descriptionTextareaRef}
              data-element="description"
              value={editedDescription}
              onChange={handleDescriptionChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Add description..."
              rows={1}
              className={cn(
                  "text-sm text-muted-foreground min-h-[28px] h-auto resize-none border-accent focus-visible:ring-accent overflow-hidden",
                  currentTextStatusStyle
              )}
              disabled={isBlocked} // Keep disabled logic
            />
        </div>
      );
    }
    return (
        <div className="flex items-baseline flex-wrap group w-full cursor-pointer" onClick={handleViewAreaClick} data-no-edit-click={isBlocked}>
            <span className={cn("text-base font-semibold mr-2", currentTextStatusStyle)}>{subtask.name}</span>
            <span
                data-description-display="true"
                className={cn(
                    "text-sm",
                    currentTextStatusStyle,
                    subtask.description ? "text-muted-foreground" : "text-muted-foreground/60 italic"
                )}
            >
                {subtask.description || '(no description)'}
            </span>
            {/* Keep edit icon logic, disable if blocked */}
            {!isBlocked && (
                 <Button
                     variant="ghost"
                     size="icon"
                     className="absolute right-10 top-1/2 transform -translate-y-1/2 h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                     onClick={handleEditIconClick}
                     aria-label="Edit subtask"
                     data-no-edit-click="true" // Prevent triggering edit mode
                 >
                     <PenLine size={15} />
                 </Button>
             )}
        </div>
    );
  };

   const TooltipWrapper: React.FC<{ children: React.ReactNode; content: React.ReactNode; disabled?: boolean }> = ({ children, content, disabled = false }) => {
    if (disabled) return <>{children}</>;
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent><p>{content}</p></TooltipContent>
        </Tooltip>
    );
  }

   // Determine tooltip and icon for drag handle
   let dragTooltip = "Drag to reorder subtask";
   let DragIcon = GripVertical;
   if (isSequenceLocked) {
       dragTooltip = "Subtask sequence locked by parent task";
       DragIcon = Lock;
   } else if (isParentDragDisabled) {
        dragTooltip = "Reordering disabled by parent list"; // More accurate maybe?
        DragIcon = Lock; // Or keep GripVertical
   } else if (isEditing) {
       dragTooltip = "Cannot reorder while editing";
   } else if (isBlocked) {
       dragTooltip = "Cannot reorder a blocked subtask";
   }


  return (
    <TooltipProvider delayDuration={100}>
        <Card
            ref={setNodeRef}
            style={style}
            className={cn(
                "mb-3 shadow-md hover:shadow-lg transition-shadow duration-200 relative border-l-4",
                priorityStyle.border,
                priorityStyle.bg,
                isDragging ? 'opacity-50' : '',
                isBlocked && subtask.status !== 'done' ? 'bg-muted/50 cursor-not-allowed' : '' // Apply blocked style only if not done
            )}
        >
        <Accordion type="single" collapsible value={isExpanded ? subtask.id : undefined} onValueChange={(value) => setIsExpanded(!!value)}>
            <AccordionItem value={subtask.id} className="border-b-0">
            <CardHeader className="p-3 flex flex-col gap-2 cursor-default" >
                 {/* Top Row: Drag handle, Status, Name/Desc, Expand/Delete */}
                 <div className="flex flex-row items-center gap-2 relative">
                    <TooltipWrapper content={dragTooltip} disabled={dragDisabledCombined}>
                        <button
                            {...attributes}
                            {...listeners}
                            className={cn(
                                "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded",
                                dragDisabledCombined ? "cursor-not-allowed text-muted-foreground/50" : "active:cursor-grabbing"
                            )}
                            aria-label={dragTooltip}
                            disabled={dragDisabledCombined}
                            onClick={e => e.stopPropagation()}
                             data-no-edit-click="true" // Prevent triggering edit mode
                        >
                            <DragIcon size={18} />
                        </button>
                    </TooltipWrapper>

                    {/* Status Dropdown */}
                <TooltipProvider delayDuration={100}>
                    <DropdownMenu>
                        <TooltipWrapper content={`Status: ${statusDisplayInfo[subtask.status].label}${isBlocked && subtask.status !== 'done' ? ' (Blocked)' : ''}`}>
                            <DropdownMenuTrigger asChild disabled={isEditing}>
                                <Button
                                     variant="ghost"
                                     size="icon"
                                     className={cn("h-7 w-7", currentStatusColor, isEditing ? 'cursor-default' : '')}
                                     aria-label={`Change status from ${subtask.status}`}
                                     onClick={e => e.stopPropagation()}
                                     data-no-edit-click="true" // Prevent triggering edit mode
                                 >
                                    <CurrentStatusIcon size={18} />
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipWrapper>
                        <DropdownMenuContent onClick={e => e.stopPropagation()}>
                            {(Object.keys(statusDisplayInfo) as Status[]).map((status) => {
                                const { icon: Icon, label } = statusDisplayInfo[status];
                                const isAllowed = canChangeStatus(subtask.id, status);
                                return (
                                    <DropdownMenuItem
                                        key={status}
                                        onSelect={() => handleStatusChange(status)}
                                        disabled={isAllowed !== true || status === subtask.status}
                                        className={cn(status === subtask.status ? "bg-accent" : "")}
                                        // status={status} // Add status variant
                                    >
                                        <Icon size={14} className="mr-2" />
                                        <span>{label}</span>
                                        {isAllowed !== true && <span className='text-xs text-destructive ml-auto'> ({isAllowed})</span>}
                                    </DropdownMenuItem>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    </TooltipProvider>


                    <div className="flex-grow min-w-0 relative">
                        {renderHeaderContent()}
                    </div>

                    <div className="flex flex-row ml-auto flex-shrink-0 space-x-1 items-center">
                        <AccordionTrigger
                            className="p-1 text-muted-foreground hover:text-foreground h-7 w-7 [&[data-state=open]>svg]:rotate-180"
                            aria-label={isExpanded ? 'Collapse activities' : 'Expand activities'}
                            onClick={e => e.stopPropagation()}
                             data-no-edit-click="true" // Prevent triggering edit mode
                        />
                        <TooltipProvider delayDuration={100}>
                        <TooltipWrapper content="Delete subtask">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive h-7 w-7"
                                onClick={(e) => { e.stopPropagation(); deleteSubtask(subtask.id); }}
                                aria-label="Delete subtask"
                                disabled={isEditing}
                                 data-no-edit-click="true" // Prevent triggering edit mode
                            >
                                <Trash2 size={16} />
                            </Button>
                        </TooltipWrapper>
                        </TooltipProvider>
                    </div>
                </div>

                {/* Second Row: Dates, Priority, Locks, Attachments, Last Edited */}
                 {!isEditing && (
                        <div className="pl-11 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-no-edit-click="true">
                             {/* Creation Date */}
                            <Popover>
                                <PopoverTrigger asChild disabled={isBlocked && subtask.status !== 'done'}>
                                <Button
                                    variant={"outline"}
                                    size="sm"
                                    title={`Creation Date: ${format(subtask.creationDate, "PPP p")}`}
                                    className={cn(
                                    "w-[110px] justify-start text-left font-normal text-xs h-5 px-1.5",
                                    isBlocked && subtask.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary'
                                    )}
                                    disabled={isBlocked && subtask.status !== 'done'}
                                >
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    <span>{format(subtask.creationDate, "MMM d, yy")}</span>
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={subtask.creationDate}
                                    onSelect={handleDateChange('creationDate')}
                                    initialFocus
                                     disabled={(date) => date > subtask.expectedCompletionDate} // Disable dates after expected completion
                                />
                                </PopoverContent>
                            </Popover>
                            <span>-</span>
                            {/* Expected Completion Date */}
                            <Popover>
                                <PopoverTrigger asChild disabled={isBlocked && subtask.status !== 'done'}>
                                <Button
                                    variant={"outline"}
                                    size="sm"
                                    title={`Expected Completion: ${format(subtask.expectedCompletionDate, "PPP")}`}
                                    className={cn(
                                    "w-[110px] justify-start text-left font-normal text-xs h-5 px-1.5",
                                    !subtask.expectedCompletionDate && "text-muted-foreground",
                                     isBlocked && subtask.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary'
                                    )}
                                    disabled={isBlocked && subtask.status !== 'done'}
                                >
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    {subtask.expectedCompletionDate ? format(subtask.expectedCompletionDate, "MMM d, yy") : <span>End</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={subtask.expectedCompletionDate}
                                    onSelect={handleDateChange('expectedCompletionDate')}
                                    initialFocus
                                    disabled={(date) => date < subtask.creationDate} // Disable dates before creation
                                />
                                </PopoverContent>
                            </Popover>

                            {/* Actual Completion Date Button/Display */}
                            {subtask.status === 'done' && subtask.actualCompletionDate ? (
                                <TooltipWrapper content={`Completed on: ${format(subtask.actualCompletionDate, "PPP p")}`}>
                                    <Button variant="outline" size="sm" className="h-5 px-1.5 text-xs border-success text-success cursor-default">
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        {format(subtask.actualCompletionDate, "MMM d, yy")}
                                    </Button>
                                </TooltipWrapper>
                            ) : ( null )}

                            <Select value={subtask.priority} onValueChange={handlePriorityChange} disabled={isBlocked && subtask.status !== 'done'}>
                                <SelectTrigger className={cn("w-[80px] h-5 text-xs px-1.5", isBlocked && subtask.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary')} disabled={isBlocked && subtask.status !== 'done'}>
                                    <SelectValue placeholder="Prio" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                            </Select>

                            <TooltipWrapper content={subtask.serialCompletionMandatory ? "Serial completion enabled (activities must be done in order)" : "Serial completion disabled"}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => { e.stopPropagation(); handleSerialCompletionChange(!subtask.serialCompletionMandatory);}}
                                    className={cn("h-6 w-6 text-muted-foreground hover:text-primary", isBlocked && subtask.status !== 'done' ? 'cursor-not-allowed opacity-50' : '', subtask.serialCompletionMandatory ? 'text-primary' : '')}
                                    aria-label={subtask.serialCompletionMandatory ? "Disable serial completion" : "Enable serial completion"}
                                    disabled={isBlocked && subtask.status !== 'done'}
                                >
                                    {subtask.serialCompletionMandatory ? <CheckSquare size={14} /> : <Square size={14} />}
                                </Button>
                            </TooltipWrapper>

                            <TooltipWrapper content={subtask.sequenceMandatory ? "Unlock activity sequence (allow reordering)" : "Lock activity sequence (prevent reordering)"}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                     onClick={(e) => { e.stopPropagation(); handleSequenceMandatoryChange(!subtask.sequenceMandatory);}}
                                    className={cn("h-6 w-6 text-muted-foreground hover:text-primary", isBlocked && subtask.status !== 'done' ? 'cursor-not-allowed opacity-50' : '', subtask.sequenceMandatory ? 'text-primary' : '')}
                                    aria-label={subtask.sequenceMandatory ? "Unlock activity sequence" : "Lock activity sequence"}
                                    disabled={isBlocked && subtask.status !== 'done'}
                                >
                                    {subtask.sequenceMandatory ? <Lock size={14} /> : <Unlock size={14} />}
                                </Button>
                            </TooltipWrapper>

                             {/* Attachment Toggle Button */}
                             <TooltipWrapper content={showAttachments ? "Hide Attachments" : "Show Attachments"}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => { e.stopPropagation(); setShowAttachments(!showAttachments);}}
                                    className={cn("h-6 w-6 text-muted-foreground hover:text-primary", showAttachments ? 'text-primary' : '')}
                                    disabled={isEditing || (isBlocked && subtask.status !== 'done')}
                                >
                                    <Paperclip size={14} />
                                    {(subtask.attachments?.length ?? 0) > 0 && (
                                        <span className="ml-0.5 text-xs">({subtask.attachments.length})</span>
                                    )}
                                </Button>
                            </TooltipWrapper>


                             {/* Last Edited Date */}
                            <TooltipWrapper content={`Last Edited: ${format(subtask.lastEditedDate, "PPP p")}`}>
                               <div className="flex items-center text-muted-foreground/80 ml-auto"> {/* Push to right */}
                                   <Clock className="mr-1 h-3 w-3" />
                                   <span>{format(subtask.lastEditedDate, "MMM d, HH:mm")}</span>
                               </div>
                           </TooltipWrapper>
                        </div>
                     )}

                 {/* Attachment Section - Shown below metadata row when toggled */}
                  {showAttachments && !isEditing && (
                     <div className="pl-11 pt-1" data-no-edit-click="true">
                        <AttachmentList
                            itemId={subtask.id}
                            attachments={subtask.attachments || []}
                            isBlocked={isBlocked && subtask.status !== 'done'}
                            isEditing={isEditing}
                         />
                     </div>
                  )}

            </CardHeader>

            <AccordionContent>
                <CardContent className="p-3 pt-0 pl-10" data-no-edit-click="true">
                <SortableContext items={activityIds} strategy={verticalListSortingStrategy} disabled={subtask.sequenceMandatory}>
                    {subtask.activities.length > 0 ? (
                    subtask.activities.map((activity) => (
                        <ActivityItem
                           key={activity.id}
                           activity={activity}
                           isParentDragDisabled={dragDisabledCombined} // Pass down the combined disabled state of the subtask
                           isSequenceLocked={subtask.sequenceMandatory} // Pass down subtask's lock state
                        />
                    ))
                    ) : (
                    <p className="text-sm text-muted-foreground italic py-2">No activities yet.</p>
                    )}
                </SortableContext>
                {/* Only allow adding activities if the subtask itself isn't blocked (and not editing) */}
                {!isEditing && !isBlocked && (
                    <Button variant="outline" size="sm" onClick={handleAddNewActivity} className="mt-2 w-full">
                        <Plus size={16} className="mr-2" /> Add Activity
                    </Button>
                )}
                </CardContent>
            </AccordionContent>
            </AccordionItem>
        </Accordion>
         {/* Keep blocked overlay if needed, adjust condition */}
        {isBlocked && subtask.status !== 'done' && (
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center rounded-md pointer-events-none">
                <span className="text-xs font-semibold text-white bg-gray-700 px-2 py-1 rounded">Blocked</span>
            </div>
        )}
        </Card>
    </TooltipProvider>
  );
};

export default SubtaskItem;
