// src/components/task-item.tsx
import React from 'react';
import type { Task, Priority, Status, Subtask } from '@/lib/types';
import useTaskStore from '@/hooks/use-task-store';
import SubtaskItem from './subtask-item';
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

interface TaskItemProps {
  task: Task;
  isParentDragDisabled: boolean; // Renamed - Indicates if parent (list) blocks dragging
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


const TaskItem: React.FC<TaskItemProps> = ({ task, isParentDragDisabled }) => {
  const { updateTask, deleteTask, addSubtask, findItem, canStartItem, canChangeStatus } = useTaskStore();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedName, setEditedName] = React.useState(task.name);
  const [editedDescription, setEditedDescription] = React.useState(task.description || '');
  const [isExpanded, setIsExpanded] = React.useState(false);
  const descriptionTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = React.useState<'name' | 'description' | null>(null);
  const [showAttachments, setShowAttachments] = React.useState(false); // State for attachments


   React.useEffect(() => {
     if (!isEditing) {
         setEditedName(task.name);
         setEditedDescription(task.description || '');
     }
   }, [task.name, task.description, isEditing]);


  const isBlocked = !canStartItem(task.id); // Task's own blocked status
  // Combine drag disabled reasons: parent disable, self editing, self blocked, self sequence lock
  const dragDisabledCombined = isParentDragDisabled || isEditing || isBlocked || task.sequenceMandatory;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', item: task },
    disabled: dragDisabledCombined, // Use combined flag
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
    zIndex: isDragging ? 10 : undefined,
  };

 const handleStatusChange = async (newStatus: Status) => {
     if (newStatus === task.status) return;

     const allowed = canChangeStatus(task.id, newStatus);
     if (allowed !== true) {
         toast({
             title: "Status Change Blocked",
             description: allowed,
             variant: "destructive",
             duration: 5000,
         });
         return;
     }

     const result = updateTask(task.id, { status: newStatus });

      if (typeof result === 'string') { // Error occurred during update
          toast({
              title: "Update Error",
              description: result,
              variant: "destructive",
          });
      } else if (result === true) {
         // Optional: Success toast
         // toast({ title: "Status Updated", description: `Task marked as ${statusDisplayInfo[newStatus].label}.` });
      }
   };


    const handleSetActualCompletionDate = () => {
       // This function is less relevant now as 'done' status handles completion date.
        const allowed = canChangeStatus(task.id, 'done');
        if (allowed !== true) {
           toast({ title: "Action Blocked", description: allowed, variant: "destructive" });
           return;
        }
       if (task.status !== 'done') {
           const result = updateTask(task.id, { status: 'done' });
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
        const updates: Partial<Task> = {};
        let nameChanged = false;
        let descriptionChanged = false;

        // Check name for changes
        if (fieldToSave === 'name' || !fieldToSave) {
            if (trimmedName && trimmedName !== task.name) {
                updates.name = trimmedName;
                nameChanged = true;
            } else if (!trimmedName && task.name) {
                 // Revert if blurring from description and name is empty
                 if(fieldToSave !== 'description') setEditedName(task.name);
            }
        }

        // Check description for changes
        if (fieldToSave === 'description' || !fieldToSave) {
            const currentDesc = task.description || '';
            if (trimmedDescription !== currentDesc) {
                // Save empty string as undefined, otherwise save trimmed description
                updates.description = trimmedDescription || undefined;
                descriptionChanged = true;
            }
        }


        if (nameChanged || descriptionChanged) {
            // updateTask handles history and lastEditedDate internally now
            const result = updateTask(task.id, updates);
             if (typeof result === 'string') {
                 toast({ title: "Update Error", description: result, variant: "destructive" });
                 // Optionally revert local state on error
                 if (nameChanged) setEditedName(task.name);
                 if (descriptionChanged) setEditedDescription(task.description || '');
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
               saveChanges('name'); // Save only name
               descriptionTextareaRef.current.focus(); // Move focus to description
               descriptionTextareaRef.current.select();
           } else {
               saveChanges(); // Save all and exit editing
               (e.target as HTMLElement).blur();
               setIsEditing(false);
               setEditingField(null);
           }
        } else if (e.key === 'Escape') {
             e.preventDefault();
            setEditedName(task.name);
            setEditedDescription(task.description || '');
            setIsEditing(false);
            setEditingField(null);
            (e.target as HTMLElement).blur();
             if (descriptionTextareaRef.current) {
                descriptionTextareaRef.current.style.height = 'auto';
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
            return; // Ignore clicks on interactive elements or specifically marked areas
        }
        if (isEditing) return;

        // Determine if clicking on the name or description part (or empty space treated as name)
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
          let updatePayload: Partial<Task> = {};
          if (field === 'expectedCompletionDate') {
               // Ensure >= creationDate
              if (date < task.creationDate) {
                   toast({ title: "Invalid Date", description: "Expected completion date cannot be earlier than creation date.", variant: "destructive" });
                  return; // Prevent invalid update
              }
              updatePayload.expectedCompletionDate = date;
          } else if (field === 'creationDate') {
               // Ensure <= expectedCompletionDate
              if (date > task.expectedCompletionDate) {
                    toast({ title: "Invalid Date", description: "Creation date cannot be later than expected completion date. Adjusting expected date.", variant: "default" });
                   updatePayload.creationDate = date;
                   updatePayload.expectedCompletionDate = date; // Adjust expected date
              } else {
                   updatePayload.creationDate = date;
              }
          }
          if (Object.keys(updatePayload).length > 0) {
             const result = updateTask(task.id, updatePayload);
              if (typeof result === 'string') {
                 toast({ title: "Update Error", description: result, variant: "destructive" });
             }
          }
      }
    };

  const handlePriorityChange = (value: Priority) => {
    updateTask(task.id, { priority: value });
  };

   const handleSerialCompletionChange = (checked: boolean | 'indeterminate') => {
        if (checked !== 'indeterminate') {
            updateTask(task.id, { serialCompletionMandatory: checked });
        }
    };

    const handleSequenceMandatoryChange = (checked: boolean | 'indeterminate') => {
        if (checked !== 'indeterminate') {
            updateTask(task.id, { sequenceMandatory: checked });
        }
    };

  const handleAddNewSubtask = () => {
    addSubtask(task.id, 'New Subtask');
     if (!isExpanded) {
        setIsExpanded(true);
    }
  };

  const subtaskIds = React.useMemo(() => task.subtasks.map(st => st.id), [task.subtasks]);
  const priorityStyle = priorityStyles[task.priority];
  const CurrentStatusIcon = statusDisplayInfo[task.status].icon;
  const currentStatusColor = statusDisplayInfo[task.status].color;
  const currentTextStatusStyle = textStatusStyles[task.status];


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
              className={cn("text-lg font-bold h-10 border-accent focus-visible:ring-accent", currentTextStatusStyle)}
              disabled={isBlocked} // Keep disabled logic
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
                  "text-sm text-muted-foreground min-h-[30px] h-auto resize-none border-accent focus-visible:ring-accent overflow-hidden",
                  currentTextStatusStyle
              )}
              disabled={isBlocked} // Keep disabled logic
            />
         </div>
      );
    }
    return (
        <div className="flex items-baseline flex-wrap group w-full cursor-pointer" onClick={handleViewAreaClick} data-no-edit-click={isBlocked}>
             <span className={cn("text-lg font-bold mr-2", currentTextStatusStyle)}>{task.name}</span>
             <span
                 data-description-display="true"
                 className={cn(
                     "text-sm",
                     currentTextStatusStyle,
                     task.description ? "text-muted-foreground" : "text-muted-foreground/60 italic"
                 )}
             >
                 {task.description || '(no description)'}
             </span>
              {/* Keep edit icon logic, disable if blocked */}
              {!isBlocked && (
                 <Button
                     variant="ghost"
                     size="icon"
                     className="absolute right-12 top-1/2 transform -translate-y-1/2 h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                     onClick={handleEditIconClick}
                     aria-label="Edit task"
                     data-no-edit-click="true" // Prevent this button click from triggering edit mode again
                 >
                     <PenLine size={16} />
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
   let dragTooltip = "Drag to reorder task";
   let DragIcon = GripVertical;
   if (task.sequenceMandatory) {
       dragTooltip = "Subtask sequence locked";
       DragIcon = Lock;
   } else if (isParentDragDisabled) {
        dragTooltip = "Reordering disabled while another item is being dragged";
        DragIcon = Lock; // Or keep GripVertical
   } else if (isEditing) {
       dragTooltip = "Cannot reorder while editing";
   } else if (isBlocked) {
       dragTooltip = "Cannot reorder a blocked task";
   }


  return (
      <TooltipProvider delayDuration={100}>
        <Card
        ref={setNodeRef}
        style={style}
        className={cn(
            "mb-4 shadow-lg hover:shadow-xl transition-shadow duration-300 relative border-l-4",
            priorityStyle.border,
            priorityStyle.bg,
            isDragging ? 'opacity-60' : '',
            isBlocked && task.status !== 'done' ? 'bg-muted/60 cursor-not-allowed' : '' // Apply blocked style only if not done
        )}
        >
        <Accordion type="single" collapsible value={isExpanded ? task.id : undefined} onValueChange={(value) => setIsExpanded(!!value)}>
            <AccordionItem value={task.id} className="border-b-0">
                <CardHeader className="p-4 flex flex-col gap-2 cursor-default">
                     {/* Top Row: Drag handle, Status, Name/Desc, Expand/Delete */}
                     <div className="flex flex-row items-center gap-3 relative">
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
                                data-no-edit-click="true" // Prevent drag handle click from triggering edit
                            >
                                <DragIcon size={20}/>
                            </button>
                        </TooltipWrapper>

                        {/* Status Dropdown */}
                        <DropdownMenu>
                            <TooltipWrapper content={`Status: ${statusDisplayInfo[task.status].label}${isBlocked && task.status !== 'done' ? ' (Blocked)' : ''}`}>
                                <DropdownMenuTrigger asChild disabled={isEditing}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn("h-8 w-8", currentStatusColor, isEditing ? 'cursor-default' : '')}
                                        aria-label={`Change status from ${task.status}`}
                                        onClick={e => e.stopPropagation()}
                                        data-no-edit-click="true" // Prevent dropdown click from triggering edit
                                     >
                                        <CurrentStatusIcon size={20} />
                                    </Button>
                                </DropdownMenuTrigger>
                            </TooltipWrapper>
                            <DropdownMenuContent onClick={e => e.stopPropagation()}>
                                {(Object.keys(statusDisplayInfo) as Status[]).map((status) => {
                                    const { icon: Icon, label } = statusDisplayInfo[status];
                                    const isAllowed = canChangeStatus(task.id, status);
                                    return (
                                        <DropdownMenuItem
                                            key={status}
                                            onSelect={() => handleStatusChange(status)}
                                            disabled={isAllowed !== true || status === task.status}
                                            className={cn(status === task.status ? "bg-accent" : "")}
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

                        <div className="flex-grow min-w-0 relative">
                            {renderHeaderContent()}
                        </div>

                        <div className="flex flex-row ml-auto flex-shrink-0 space-x-1 items-center">
                            <AccordionTrigger
                                className="p-1 text-muted-foreground hover:text-foreground h-8 w-8 [&[data-state=open]>svg]:rotate-180"
                                aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                onClick={e => e.stopPropagation()}
                                data-no-edit-click="true" // Prevent accordion click from triggering edit
                            />
                            <TooltipWrapper content="Delete task">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive h-8 w-8"
                                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                    aria-label="Delete task"
                                    disabled={isEditing}
                                    data-no-edit-click="true" // Prevent delete click from triggering edit
                                >
                                    <Trash2 size={18} />
                                </Button>
                            </TooltipWrapper>
                        </div>
                    </div>

                    {/* Second Row: Dates, Priority, Locks, Attachments, Last Edited */}
                    {!isEditing && (
                            <div className="pl-12 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" data-no-edit-click="true">
                                {/* Creation Date */}
                                <Popover>
                                    <PopoverTrigger asChild disabled={isBlocked && task.status !== 'done'}>
                                    <Button
                                        variant={"outline"}
                                        size="sm"
                                        title={`Creation Date: ${format(task.creationDate, "PPP p")}`}
                                        className={cn(
                                        "w-[110px] justify-start text-left font-normal h-6 px-2",
                                        isBlocked && task.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary'
                                        )}
                                        disabled={isBlocked && task.status !== 'done'}
                                    >
                                        <CalendarIcon className="mr-1 h-3 w-3" />
                                        <span>{format(task.creationDate, "MMM d, yy")}</span>
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={task.creationDate}
                                        onSelect={handleDateChange('creationDate')}
                                        initialFocus
                                        disabled={(date) => date > task.expectedCompletionDate} // Disable dates after expected completion
                                    />
                                    </PopoverContent>
                                </Popover>
                                <span>-</span>
                                {/* Expected Completion Date */}
                                <Popover>
                                    <PopoverTrigger asChild disabled={isBlocked && task.status !== 'done'}>
                                    <Button
                                        variant={"outline"}
                                        size="sm"
                                        title={`Expected Completion: ${format(task.expectedCompletionDate, "PPP")}`}
                                        className={cn(
                                        "w-[110px] justify-start text-left font-normal h-6 px-2",
                                        !task.expectedCompletionDate && "text-muted-foreground",
                                        isBlocked && task.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary'
                                        )}
                                        disabled={isBlocked && task.status !== 'done'}
                                    >
                                        <CalendarIcon className="mr-1 h-3 w-3" />
                                        {task.expectedCompletionDate ? format(task.expectedCompletionDate, "MMM d, yy") : <span>End</span>}
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={task.expectedCompletionDate}
                                        onSelect={handleDateChange('expectedCompletionDate')}
                                        initialFocus
                                        disabled={(date) => date < task.creationDate} // Disable dates before creation
                                    />
                                    </PopoverContent>
                                </Popover>

                                 {/* Actual Completion Date Button/Display */}
                                {task.status === 'done' && task.actualCompletionDate ? (
                                    <TooltipWrapper content={`Completed on: ${format(task.actualCompletionDate, "PPP p")}`}>
                                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs border-success text-success cursor-default">
                                            <CheckCircle2 className="mr-1 h-3 w-3" />
                                            {format(task.actualCompletionDate, "MMM d, yy")}
                                        </Button>
                                    </TooltipWrapper>
                                ) : ( null )}

                                <Select value={task.priority} onValueChange={handlePriorityChange} disabled={isBlocked && task.status !== 'done'}>
                                    <SelectTrigger className={cn("w-[90px] h-6 text-xs px-2", isBlocked && task.status !== 'done' ? 'cursor-not-allowed opacity-50' : 'hover:border-primary')} disabled={isBlocked && task.status !== 'done'}>
                                        <SelectValue placeholder="Prio" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                </Select>

                                <TooltipWrapper content={task.serialCompletionMandatory ? "Serial completion enabled (subtasks must be done in order)" : "Serial completion disabled"}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => { e.stopPropagation(); handleSerialCompletionChange(!task.serialCompletionMandatory);}}
                                        className={cn("h-6 w-6 text-muted-foreground hover:text-primary", isBlocked && task.status !== 'done' ? 'cursor-not-allowed opacity-50' : '', task.serialCompletionMandatory ? 'text-primary' : '')}
                                        aria-label={task.serialCompletionMandatory ? "Disable serial completion" : "Enable serial completion"}
                                        disabled={isBlocked && task.status !== 'done'}
                                    >
                                        {task.serialCompletionMandatory ? <CheckSquare size={14} /> : <Square size={14} />}
                                    </Button>
                                </TooltipWrapper>

                                <TooltipWrapper content={task.sequenceMandatory ? "Unlock subtask sequence (allow reordering)" : "Lock subtask sequence (prevent reordering)"}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => { e.stopPropagation(); handleSequenceMandatoryChange(!task.sequenceMandatory);}}
                                        className={cn("h-6 w-6 text-muted-foreground hover:text-primary", isBlocked && task.status !== 'done' ? 'cursor-not-allowed opacity-50' : '', task.sequenceMandatory ? 'text-primary' : '')}
                                        aria-label={task.sequenceMandatory ? "Unlock subtask sequence" : "Lock subtask sequence"}
                                        disabled={isBlocked && task.status !== 'done'}
                                    >
                                        {task.sequenceMandatory ? <Lock size={14} /> : <Unlock size={14} />}
                                    </Button>
                                </TooltipWrapper>

                                {/* Attachment Toggle Button */}
                                <TooltipWrapper content={showAttachments ? "Hide Attachments" : "Show Attachments"}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => { e.stopPropagation(); setShowAttachments(!showAttachments);}}
                                        className={cn("h-6 w-6 text-muted-foreground hover:text-primary", showAttachments ? 'text-primary' : '')}
                                        disabled={isEditing || (isBlocked && task.status !== 'done')}
                                    >
                                        <Paperclip size={14} />
                                        {(task.attachments?.length ?? 0) > 0 && (
                                            <span className="ml-0.5 text-xs">({task.attachments.length})</span>
                                        )}
                                    </Button>
                                </TooltipWrapper>

                                 {/* Last Edited Date */}
                                <TooltipWrapper content={`Last Edited: ${format(task.lastEditedDate, "PPP p")}`}>
                                   <div className="flex items-center text-muted-foreground/80 ml-auto"> {/* Push to right */}
                                       <Clock className="mr-1 h-3 w-3" />
                                       <span>{format(task.lastEditedDate, "MMM d, HH:mm")}</span>
                                   </div>
                               </TooltipWrapper>
                            </div>
                         )}

                    {/* Attachment Section - Shown below metadata row when toggled */}
                    {showAttachments && !isEditing && (
                        <div className="pl-12 pt-1" data-no-edit-click="true">
                            <AttachmentList
                                itemId={task.id}
                                attachments={task.attachments || []}
                                isBlocked={isBlocked && task.status !== 'done'}
                                isEditing={isEditing}
                             />
                        </div>
                    )}
                </CardHeader>

                <AccordionContent>
                    <CardContent className="p-4 pt-0 pl-12" data-no-edit-click="true">
                     <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy} disabled={task.sequenceMandatory}>
                        {task.subtasks.length > 0 ? (
                        task.subtasks.map((subtask) => (
                            <SubtaskItem
                               key={subtask.id}
                               subtask={subtask}
                               isParentDragDisabled={dragDisabledCombined} // Pass down the task's combined disabled state
                               isSequenceLocked={task.sequenceMandatory} // Pass down task's lock state
                            />
                        ))
                        ) : (
                        <p className="text-sm text-muted-foreground italic py-2">No subtasks yet.</p>
                        )}
                    </SortableContext>
                    {/* Only allow adding subtasks if the task itself isn't blocked (and not editing) */}
                    {!isEditing && !isBlocked && (
                            <Button variant="outline" size="sm" onClick={handleAddNewSubtask} className="mt-2 w-full">
                                <Plus size={16} className="mr-2" /> Add Subtask
                            </Button>
                    )}
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
            </Accordion>
             {/* Keep blocked overlay if needed, adjust condition */}
            {isBlocked && task.status !== 'done' && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-md pointer-events-none">
                    <span className="text-xs font-semibold text-white bg-gray-800 px-2 py-1 rounded">Blocked</span>
                </div>
            )}
        </Card>
     </TooltipProvider>
  );
};

export default TaskItem;
