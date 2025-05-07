// src/components/activity-item.tsx
import React from 'react';
import type { Activity, Priority, Status } from '@/lib/types';
import useTaskStore from '@/hooks/use-task-store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'; // Import Dropdown components
import { GripVertical, Trash2, Calendar as CalendarIcon, Lock, PenLine, CheckCircle2, Clock, Play, Check, CircleDotDashed, CircleOff, Paperclip } from 'lucide-react'; // Added status icons, Paperclip
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import AttachmentList from './attachment-list'; // Import AttachmentList

interface ActivityItemProps {
  activity: Activity;
  isParentDragDisabled: boolean; // Renamed from isDragDisabled - Indicates if parent (subtask) blocks dragging
  isSequenceLocked: boolean; // New prop to indicate if reordering is locked by parent
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
}

// Status styles for icon/badge coloring
const statusDisplayInfo: Record<Status, { icon: React.ElementType; color: string; label: string }> = {
    todo: { icon: CircleOff, color: 'text-muted-foreground', label: 'To Do' },
    started: { icon: Play, color: 'text-started', label: 'Started' },
    inprogress: { icon: CircleDotDashed, color: 'text-inprogress', label: 'In Progress'},
    done: { icon: Check, color: 'text-success', label: 'Done' },
}


const ActivityItem: React.FC<ActivityItemProps> = ({ activity, isParentDragDisabled, isSequenceLocked }) => {
  const { updateActivity, deleteActivity, canStartItem, canChangeStatus } = useTaskStore();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedName, setEditedName] = React.useState(activity.name);
  const [editedDescription, setEditedDescription] = React.useState(activity.description || '');
  const descriptionTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = React.useState<'name' | 'description' | null>(null); // Track which field is focused
  const [showAttachments, setShowAttachments] = React.useState(false); // State to toggle attachments view


  React.useEffect(() => {
    // Only update local state if not currently editing
    if (!isEditing) {
        setEditedName(activity.name);
        setEditedDescription(activity.description || '');
    }
  }, [activity.name, activity.description, isEditing]);


  const isBlocked = !canStartItem(activity.id); // Activity's own blocked status
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
      id: activity.id,
      data: { type: 'activity', item: activity },
      disabled: dragDisabledCombined, // Use the combined flag
   });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
    zIndex: isDragging ? 10 : undefined,
  };

 const handleStatusChange = async (newStatus: Status) => {
     if (newStatus === activity.status) return;

     const allowed = canChangeStatus(activity.id, newStatus);
     if (allowed !== true) {
         toast({
             title: "Status Change Blocked",
             description: allowed,
             variant: "destructive",
             duration: 5000,
         });
         return;
     }

     const result = updateActivity(activity.id, { status: newStatus });

      if (typeof result === 'string') { // Error occurred during update
          toast({
              title: "Update Error",
              description: result,
              variant: "destructive",
          });
      } else if (result === true) {
         // Optional: Success toast
         // toast({ title: "Status Updated", description: `Activity marked as ${statusDisplayInfo[newStatus].label}.` });
      }
   };


    const handleSetActualCompletionDate = () => {
        // This function is less relevant now as 'done' status handles completion date.
        // Kept for potential future use or if direct setting is needed.
       const allowed = canChangeStatus(activity.id, 'done');
       if (allowed !== true) {
           toast({ title: "Action Blocked", description: allowed, variant: "destructive" });
           return;
       }
        if (activity.status !== 'done') {
             const result = updateActivity(activity.id, { status: 'done' });
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
    // Auto-adjust height
    if (descriptionTextareaRef.current) {
      descriptionTextareaRef.current.style.height = 'auto';
      descriptionTextareaRef.current.style.height = `${descriptionTextareaRef.current.scrollHeight}px`;
    }
  };

    const saveChanges = (fieldToSave?: 'name' | 'description') => {
        const trimmedName = editedName.trim();
        const trimmedDescription = editedDescription.trim();
        const updates: Partial<Activity> = {};
        let nameChanged = false;
        let descriptionChanged = false;

        // Check name for changes
        if (fieldToSave === 'name' || !fieldToSave) {
            if (trimmedName && trimmedName !== activity.name) {
                updates.name = trimmedName;
                nameChanged = true;
            } else if (!trimmedName && activity.name) {
                 // Revert if blurring from description and name is empty
                 if (fieldToSave !== 'description') setEditedName(activity.name);
            }
        }

        // Check description for changes
        if (fieldToSave === 'description' || !fieldToSave) {
            const currentDesc = activity.description || '';
            if (trimmedDescription !== currentDesc) {
                updates.description = trimmedDescription || undefined; // Save empty as undefined
                descriptionChanged = true;
            }
        }


        if (nameChanged || descriptionChanged) {
            // updateActivity handles history and lastEditedDate internally
            const result = updateActivity(activity.id, updates);
             if (typeof result === 'string') {
                toast({ title: "Update Error", description: result, variant: "destructive" });
                 // Revert local state on error
                 if (nameChanged) setEditedName(activity.name);
                 if (descriptionChanged) setEditedDescription(activity.description || '');
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
       // Use setTimeout to allow relatedTarget to be updated
      requestAnimationFrame(() => {
         const relatedTarget = document.activeElement;
         // Check if the new focused element is within the editing container
         const parentContainer = currentTarget.closest('[data-editing-container="true"]');
         if (!parentContainer || !parentContainer.contains(relatedTarget)) {
             saveChanges(); // Save all changes if focus moves outside the container
         }
      });
   };


  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const fieldName = (e.target as HTMLElement).dataset.element as 'name' | 'description' | undefined;
    if (e.key === 'Enter' && !(e.shiftKey && fieldName === 'description') && e.nativeEvent.isComposing === false) {
       e.preventDefault();
       if (fieldName === 'name' && descriptionTextareaRef.current) {
           saveChanges('name'); // Save only name
           descriptionTextareaRef.current.focus(); // Move focus to description
           descriptionTextareaRef.current.select();
       } else {
           saveChanges(); // Save all and exit editing mode
           (e.target as HTMLElement).blur(); // Blur the element first
           setIsEditing(false);
           setEditingField(null);
       }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        // Revert changes and exit editing
        setEditedName(activity.name);
        setEditedDescription(activity.description || '');
        setIsEditing(false);
        setEditingField(null);
        (e.target as HTMLElement).blur();
         if (descriptionTextareaRef.current) {
            descriptionTextareaRef.current.style.height = 'auto'; // Reset height
         }
    }
  };

    const startEditing = (fieldToFocus: 'name' | 'description' = 'name') => {
        // Allow starting edit even if blocked, but inputs will be disabled
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
                // Ensure correct height calculation on focus
                descriptionTextareaRef.current.style.height = 'auto';
                descriptionTextareaRef.current.style.height = `${descriptionTextareaRef.current.scrollHeight}px`;
            }
        }, 0);
    };


    const handleViewAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        // Ignore clicks on interactive elements within the view area
         if (target.closest('button, a, input, textarea, [role="combobox"], [role="menu"], [role="dialog"], [data-no-edit-click="true"]')) {
            return;
        }
        if (isEditing) return; // Prevent starting edit if already editing

        // Determine if clicking on the name or description part
        if (target.closest('[data-description-display="true"]')) {
             startEditing('description');
        } else {
            startEditing('name');
        }
    };

    const handleEditIconClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card click handler
        if (!isEditing) {
            startEditing('name');
        } else {
             // If already editing, just focus the name field if not already focused
             if (nameInputRef.current && editingField !== 'name') {
                nameInputRef.current.focus();
                nameInputRef.current.select();
             }
        }
    };

    const handleDateChange = (field: 'creationDate' | 'expectedCompletionDate') => (date: Date | undefined) => {
        if (date) {
            let updatePayload: Partial<Activity> = {};
            if (field === 'expectedCompletionDate') {
                // Ensure expectedCompletionDate is not before creationDate
                if (date < activity.creationDate) {
                    toast({ title: "Invalid Date", description: "Expected completion date cannot be earlier than creation date.", variant: "destructive" });
                    return; // Prevent invalid update
                }
                updatePayload.expectedCompletionDate = date;
            } else if (field === 'creationDate') {
                 // Ensure creationDate is not after expectedCompletionDate
                if (date > activity.expectedCompletionDate) {
                     toast({ title: "Invalid Date", description: "Creation date cannot be later than expected completion date. Adjusting expected date.", variant: "default" });
                     updatePayload.creationDate = date;
                     updatePayload.expectedCompletionDate = date; // Adjust expected date as well
                } else {
                     updatePayload.creationDate = date;
                }
            }

            if (Object.keys(updatePayload).length > 0) {
                 const result = updateActivity(activity.id, updatePayload);
                  if (typeof result === 'string') {
                    toast({ title: "Update Error", description: result, variant: "destructive" });
                 }
            }
        }
    };


  const handlePriorityChange = (value: Priority) => {
    updateActivity(activity.id, { priority: value });
  };

  const priorityStyle = priorityStyles[activity.priority];
  const CurrentStatusIcon = statusDisplayInfo[activity.status].icon;
  const currentStatusColor = statusDisplayInfo[activity.status].color;
  const currentTextStatusStyle = textStatusStyles[activity.status];


  const renderContent = () => {
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
              className={cn("text-sm font-medium h-8 border-accent focus-visible:ring-accent", currentTextStatusStyle)}
              disabled={isBlocked} // Keep disabled logic if needed for editing blocked items
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
                  "text-xs text-muted-foreground min-h-[24px] h-auto resize-none border-accent focus-visible:ring-accent overflow-hidden",
                   currentTextStatusStyle
              )}
               disabled={isBlocked} // Keep disabled logic
            />
        </div>
      );
    }
    return (
         <div className={cn("flex items-baseline flex-wrap group w-full relative", isEditing ? '' : 'cursor-pointer')} onClick={handleViewAreaClick} data-no-edit-click={isBlocked || isEditing}>
             <span className={cn("text-sm font-medium mr-2", currentTextStatusStyle)}>{activity.name}</span>
             <span
                 data-description-display="true"
                 className={cn(
                     "text-xs",
                     currentTextStatusStyle,
                     activity.description ? "text-muted-foreground" : "text-muted-foreground/60 italic"
                 )}
             >
                 {activity.description || '(no description)'}
             </span>
              {/* Keep edit icon logic, disable if blocked or editing */}
              {!isEditing && !isBlocked && (
                 <Button
                     variant="ghost"
                     size="icon"
                     className="absolute right-0 top-0 h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" // Adjusted position: right-0, top-0
                     onClick={handleEditIconClick}
                     aria-label="Edit activity"
                     data-no-edit-click="true" // Prevent edit icon click from triggering edit mode again
                 >
                     <PenLine size={14} />
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
   let dragTooltip = "Drag to reorder activity";
   let DragIcon = GripVertical;
   if (isSequenceLocked) {
       dragTooltip = "Activity sequence locked by parent subtask";
       DragIcon = Lock;
   } else if (isParentDragDisabled) {
        dragTooltip = "Reordering disabled by parent task";
        DragIcon = Lock; // Or keep GripVertical if visually preferred
   } else if (isEditing) {
       dragTooltip = "Cannot reorder while editing";
   } else if (isBlocked) {
       dragTooltip = "Cannot reorder a blocked activity";
   }

  return (
     <TooltipProvider delayDuration={100}>
        <Card
            ref={setNodeRef}
            style={style}
            className={cn(
                "mb-2 shadow-sm hover:shadow-md transition-shadow duration-200 relative border-l-4",
                priorityStyle.border,
                priorityStyle.bg,
                isDragging ? 'opacity-50' : '',
                isBlocked && activity.status !== 'done' ? 'bg-muted/50 cursor-not-allowed' : '' // Only apply blocked style if not done
            )}
        >
        <CardContent className="p-2 space-y-1 relative">
             <div className="flex items-center gap-2">
                 <TooltipWrapper content={dragTooltip} disabled={dragDisabledCombined}>
                    <button
                        {...attributes}
                        {...listeners}
                        className={cn(
                            "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded",
                            dragDisabledCombined ? "cursor-not-allowed text-muted-foreground/50" : "active:cursor-grabbing"
                        )}
                        aria-label={dragTooltip} // Use descriptive tooltip text
                        disabled={dragDisabledCombined}
                        data-no-edit-click="true" // Prevent triggering edit mode
                    >
                        <DragIcon size={16} /> {/* Use dynamic icon */}
                    </button>
                </TooltipWrapper>

            {/* Status Dropdown */}
                <DropdownMenu>
                    <TooltipWrapper content={`Status: ${statusDisplayInfo[activity.status].label}${isBlocked && activity.status !== 'done' ? ' (Blocked)' : ''}`}>
                        <DropdownMenuTrigger asChild disabled={isEditing}>
                             <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-6 w-6", currentStatusColor, isEditing ? 'cursor-default' : '')}
                                aria-label={`Change status from ${activity.status}`}
                                data-no-edit-click="true" // Prevent triggering edit mode
                            >
                                <CurrentStatusIcon size={16} />
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipWrapper>
                    <DropdownMenuContent>
                        {(Object.keys(statusDisplayInfo) as Status[]).map((status) => {
                            const { icon: Icon, label } = statusDisplayInfo[status];
                            const isAllowed = canChangeStatus(activity.id, status);
                            return (
                                <DropdownMenuItem
                                    key={status}
                                    onSelect={() => handleStatusChange(status)}
                                    disabled={isAllowed !== true || status === activity.status}
                                    className={cn(status === activity.status ? "bg-accent" : "")}
                                    // status={status} // Add status variant for styling
                                >
                                    <Icon size={14} className="mr-2" />
                                    <span>{label}</span>
                                    {isAllowed !== true && <span className='text-xs text-destructive ml-auto'> ({isAllowed})</span>}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex-grow min-w-0 pr-6"> {/* Add padding-right to make space for the absolutely positioned delete button */}
                    {renderContent()}
                </div>

                <TooltipWrapper content="Delete activity">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-7 w-7 ml-auto flex-shrink-0"
                        onClick={() => deleteActivity(activity.id)}
                        aria-label="Delete activity"
                        disabled={isEditing}
                         data-no-edit-click="true" // Prevent triggering edit mode
                    >
                        <Trash2 size={16} />
                    </Button>
                </TooltipWrapper>
            </div>

             {!isEditing && (
                     <div className="pl-9 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-no-edit-click="true">
                         {/* Creation Date */}
                         <Popover>
                            <PopoverTrigger asChild disabled={isBlocked && activity.status !== 'done'}>
                            <Button
                                variant={"outline"}
                                size="sm"
                                title={`Creation Date: ${format(activity.creationDate, "PPP p")}`}
                                className={cn(
                                "w-[110px] justify-start text-left font-normal text-xs h-5 px-1.5",
                                isBlocked && activity.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary'
                                )}
                                disabled={isBlocked && activity.status !== 'done'}
                            >
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                <span>{format(activity.creationDate, "MMM d, yy")}</span>
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={activity.creationDate}
                                onSelect={handleDateChange('creationDate')}
                                initialFocus
                                disabled={(date) => date > activity.expectedCompletionDate} // Disable dates after expected completion
                            />
                            </PopoverContent>
                        </Popover>
                        <span>-</span>
                        {/* Expected Completion Date */}
                        <Popover>
                            <PopoverTrigger asChild disabled={isBlocked && activity.status !== 'done'}>
                             <Button
                                variant={"outline"}
                                size="sm"
                                title={`Expected Completion: ${format(activity.expectedCompletionDate, "PPP")}`}
                                className={cn(
                                "w-[110px] justify-start text-left font-normal text-xs h-5 px-1.5",
                                !activity.expectedCompletionDate && "text-muted-foreground",
                                isBlocked && activity.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary'
                                )}
                                disabled={isBlocked && activity.status !== 'done'}
                            >
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                {activity.expectedCompletionDate ? format(activity.expectedCompletionDate, "MMM d, yy") : <span>End</span>}
                             </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={activity.expectedCompletionDate}
                                onSelect={handleDateChange('expectedCompletionDate')}
                                initialFocus
                                disabled={(date) => date < activity.creationDate} // Disable dates before creation
                            />
                            </PopoverContent>
                        </Popover>

                         {/* Actual Completion Date Button/Display */}
                         {activity.status === 'done' && activity.actualCompletionDate ? (
                             <TooltipWrapper content={`Completed on: ${format(activity.actualCompletionDate, "PPP p")}`}>
                                 <Button variant="outline" size="sm" className="h-5 px-1.5 text-xs border-success text-success cursor-default">
                                     <CheckCircle2 className="mr-1 h-3 w-3" />
                                     {format(activity.actualCompletionDate, "MMM d, yy")}
                                 </Button>
                             </TooltipWrapper>
                         ) : ( null )}

                        <Select value={activity.priority} onValueChange={handlePriorityChange} disabled={isBlocked && activity.status !== 'done'}>
                            <SelectTrigger className={cn("w-[80px] h-5 text-xs px-1.5", isBlocked && activity.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary')} disabled={isBlocked && activity.status !== 'done'}>
                                <SelectValue placeholder="Prio" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Attachment Toggle Button */}
                        <TooltipWrapper content={showAttachments ? "Hide Attachments" : "Show Attachments"}>
                             <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowAttachments(!showAttachments)}
                                className={cn("h-6 w-6 text-muted-foreground hover:text-primary", showAttachments ? 'text-primary' : '')}
                                disabled={isEditing || (isBlocked && activity.status !== 'done')}
                            >
                                <Paperclip size={14} />
                                {(activity.attachments?.length ?? 0) > 0 && (
                                    <span className="ml-0.5 text-xs">({activity.attachments.length})</span>
                                )}
                            </Button>
                        </TooltipWrapper>

                         {/* Last Edited Date */}
                         <TooltipWrapper content={`Last Edited: ${format(activity.lastEditedDate, "PPP p")}`}>
                            <div className="flex items-center text-muted-foreground/80 ml-auto"> {/* Push to right */}
                                <Clock className="mr-1 h-3 w-3" />
                                <span>{format(activity.lastEditedDate, "MMM d, HH:mm")}</span>
                            </div>
                        </TooltipWrapper>
                    </div>
                 )}

            {/* Attachment Section */}
             {showAttachments && (
                 <div className="pl-9" data-no-edit-click="true">
                    <AttachmentList
                        itemId={activity.id}
                        attachments={activity.attachments || []}
                        isBlocked={isBlocked && activity.status !== 'done'}
                        isEditing={isEditing}
                     />
                 </div>
             )}

        </CardContent>
        {/* Keep blocked overlay if needed, but adjust condition */}
        {isBlocked && activity.status !== 'done' && (
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center rounded-md pointer-events-none">
                    <span className="text-xs font-semibold text-white bg-gray-700 px-2 py-1 rounded">Blocked</span>
                </div>
            )}
        </Card>
    </TooltipProvider>
  );
};

export default ActivityItem;
