// src/components/task-list.tsx
'use client';

import React, { useState, useCallback } from 'react';
import type { TaskList as TaskListType, Task, Subtask, Activity, SuggestTaskScheduleInput, SuggestTaskScheduleOutput } from '@/lib/types';
import useTaskStore from '@/hooks/use-task-store';
import TaskItem from './task-item';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Plus, BrainCircuit, Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DropAnimation,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { suggestTaskSchedule } from '@/ai/flows/suggest-task-schedule'; // Import Genkit flow
import { useToast } from '@/hooks/use-toast'; // Import useToast
import ActivityItem from './activity-item'; // Import ActivityItem for DragOverlay
import SubtaskItem from './subtask-item'; // Import SubtaskItem for DragOverlay

interface TaskListProps {
  list: TaskListType;
}

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
    },
  }),
};


const TaskList: React.FC<TaskListProps> = ({ list }) => {
  const { addTask, reorderTasks, reorderSubtasks, reorderActivities, updateTaskListName, deleteTaskList, findItem } = useTaskStore();
  const { toast } = useToast();
  const [newTaskName, setNewTaskName] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'task' | 'subtask' | 'activity' | null>(null);
  const [isEditingListName, setIsEditingListName] = useState(false);
  const [editedListName, setEditedListName] = useState(list.name);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const taskIds = React.useMemo(() => list.tasks.map(t => t.id), [list.tasks]);

  const handleAddTask = () => {
    if (newTaskName.trim()) {
      // addTask now takes creationDate and expectedCompletionDate
      addTask(list.id, newTaskName.trim()); // Use defaults from store for dates
      setNewTaskName('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddTask();
    }
  };

   const handleListNameBlur = () => {
        if (editedListName.trim() && editedListName !== list.name) {
            updateTaskListName(list.id, editedListName.trim());
        } else {
            setEditedListName(list.name);
        }
        setIsEditingListName(false);
    };

    const handleListNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleListNameBlur();
        } else if (e.key === 'Escape') {
            setEditedListName(list.name);
            setIsEditingListName(false);
        }
    };

    const handleDeleteListConfirm = () => {
      deleteTaskList(list.id);
      setIsDeleteDialogOpen(false);
      toast({ title: "List Deleted", description: `The list "${list.name}" has been deleted.` });
    };


   const handleSuggestSchedule = async () => {
        setIsScheduling(true);
        try {
            // 1. Prepare input for the AI flow
            const genkitInput: SuggestTaskScheduleInput = {
                tasks: list.tasks.map(task => ({
                    id: task.id,
                    name: task.name,
                    priority: task.priority,
                    // Use expectedCompletionDate for AI's deadline concept
                    deadline: task.expectedCompletionDate ? task.expectedCompletionDate.toISOString() : undefined,
                    dependencies: task.dependencies || [],
                     // Simple time estimation - needs refinement
                    estimatedTime: 1 + (task.subtasks?.reduce((sum, st) => sum + 1 + (st.activities?.length || 0), 0) || 0),
                    description: task.description,
                    subtasks: task.subtasks?.map(subtask => ({
                        id: subtask.id,
                        name: subtask.name,
                        priority: subtask.priority,
                        deadline: subtask.expectedCompletionDate ? subtask.expectedCompletionDate.toISOString() : undefined,
                        dependencies: subtask.dependencies || [],
                        estimatedTime: 1 + (subtask.activities?.length || 0),
                        description: subtask.description,
                    })),
                })),
                 userContext: `Scheduling tasks for the list "${list.name}". Current date: ${new Date().toISOString()}`, // Provide current date context
            };

             // 2. Call the Genkit flow
            const result: SuggestTaskScheduleOutput = await suggestTaskSchedule(genkitInput);

             // 3. Apply the suggested schedule
            if (result.schedule && result.schedule.length > 0) {
                const updates: { itemId: string; updates: Partial<Task | Subtask | Activity> }[] = [];
                result.schedule.forEach(scheduledItem => {
                    const foundItem = findItem(scheduledItem.itemId);
                    if (foundItem) {
                         const creationDate = new Date(scheduledItem.creationDate);
                         const expectedCompletionDate = new Date(scheduledItem.expectedCompletionDate);

                         // Basic validation: completion >= creation
                         if (expectedCompletionDate < creationDate) {
                            console.warn(`AI suggested completion before creation for ${scheduledItem.itemId}. Adjusting.`);
                            expectedCompletionDate.setTime(creationDate.getTime()); // Set completion to creation time
                         }

                         updates.push({
                            itemId: scheduledItem.itemId,
                            updates: {
                                // Map AI output back to our fields
                                creationDate: creationDate,
                                expectedCompletionDate: expectedCompletionDate,
                                // AI doesn't set actualCompletionDate or lastEditedDate
                            }
                         });
                    } else {
                        console.warn(`AI suggested schedule for unknown item ID: ${scheduledItem.itemId}`);
                    }
                });

                // Apply updates through the store
                updates.forEach(({ itemId, updates: itemUpdates }) => {
                     const found = findItem(itemId);
                     if (found) {
                         // Ensure update functions exist before calling
                         if (found.type === 'task' && useTaskStore.getState().updateTask) useTaskStore.getState().updateTask(itemId, itemUpdates as Partial<Task>);
                         else if (found.type === 'subtask' && useTaskStore.getState().updateSubtask) useTaskStore.getState().updateSubtask(itemId, itemUpdates as Partial<Subtask>);
                         else if (found.type === 'activity' && useTaskStore.getState().updateActivity) useTaskStore.getState().updateActivity(itemId, itemUpdates as Partial<Activity>);
                     }
                });


                 toast({
                    title: "Schedule Suggested",
                    description: "AI has updated task creation and expected completion dates.",
                });
            } else {
                 toast({
                    title: "Scheduling Incomplete",
                    description: "AI could not generate a schedule. Please check task details.",
                    variant: "destructive",
                });
            }

        } catch (error) {
            console.error("Error suggesting schedule:", error);
             toast({
                title: "Scheduling Failed",
                description: "An error occurred while suggesting the schedule. " + (error instanceof Error ? error.message : String(error)),
                variant: "destructive",
            });
        } finally {
            setIsScheduling(false);
        }
    };

   const onDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setActiveType(event.active.data.current?.type);
    }, []);

   const onDragEnd = useCallback((event: DragEndEvent) => {
        setActiveId(null);
        setActiveType(null);
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const activeType = active.data.current?.type;
            const overType = over.data.current?.type;
            const activeItem = active.data.current?.item;
            const overItem = over.data.current?.item;

            if (!activeItem || !overItem) return;

            // --- Task Reordering ---
            if (activeType === 'task' && overType === 'task' && activeItem.listId === overItem.listId) {
                const oldIndex = list.tasks.findIndex(task => task.id === active.id);
                const newIndex = list.tasks.findIndex(task => task.id === over.id);
                 if (oldIndex !== -1 && newIndex !== -1) {
                    const newTaskOrder = arrayMove(list.tasks, oldIndex, newIndex).map(t => t.id);
                    reorderTasks(list.id, newTaskOrder);
                 }
            }
            // --- Subtask Reordering ---
            else if (activeType === 'subtask' && overType === 'subtask' && activeItem.parentId === overItem.parentId) {
                const parentTaskResult = findItem(activeItem.parentId);
                 if (parentTaskResult && parentTaskResult.type === 'task') {
                     const parentTask = parentTaskResult.item as Task;
                     if (!parentTask.sequenceMandatory) {
                         const oldIndex = parentTask.subtasks.findIndex(st => st.id === active.id);
                         const newIndex = parentTask.subtasks.findIndex(st => st.id === over.id);
                         if (oldIndex !== -1 && newIndex !== -1) {
                            const newSubtaskOrder = arrayMove(parentTask.subtasks, oldIndex, newIndex).map(st => st.id);
                            reorderSubtasks(parentTask.id, newSubtaskOrder);
                         }
                     } else {
                          toast({ title: "Reorder Blocked", description: "Subtask sequence is locked by the parent task.", variant: "destructive" });
                     }
                 }
            }
            // --- Activity Reordering ---
            else if (activeType === 'activity' && overType === 'activity' && activeItem.parentId === overItem.parentId) {
                 const parentSubtaskResult = findItem(activeItem.parentId);
                  if (parentSubtaskResult && parentSubtaskResult.type === 'subtask') {
                     const parentSubtask = parentSubtaskResult.item as Subtask;
                     if (!parentSubtask.sequenceMandatory) {
                         const oldIndex = parentSubtask.activities.findIndex(a => a.id === active.id);
                         const newIndex = parentSubtask.activities.findIndex(a => a.id === over.id);
                         if (oldIndex !== -1 && newIndex !== -1) {
                             const newActivityOrder = arrayMove(parentSubtask.activities, oldIndex, newIndex).map(a => a.id);
                             reorderActivities(parentSubtask.id, newActivityOrder);
                         }
                     } else {
                          toast({ title: "Reorder Blocked", description: "Activity sequence is locked by the parent subtask.", variant: "destructive" });
                     }
                  }
            }
        }
    }, [list.id, list.tasks, reorderTasks, reorderSubtasks, reorderActivities, findItem, toast]);


   const renderActiveDragOverlay = () => {
        if (!activeId || !activeType) return null;

        const activeItemResult = findItem(activeId);
        if (!activeItemResult) return null;
        const { item } = activeItemResult;

        // Determine if the *direct* parent imposes a sequence lock
        let isSequenceLockedByParent = false;
        if (activeType === 'subtask') {
            const parentTaskResult = findItem(item.parentId);
            isSequenceLockedByParent = parentTaskResult?.type === 'task' && (parentTaskResult.item as Task).sequenceMandatory;
        } else if (activeType === 'activity') {
            const parentSubtaskResult = findItem(item.parentId);
            isSequenceLockedByParent = parentSubtaskResult?.type === 'subtask' && (parentSubtaskResult.item as Subtask).sequenceMandatory;
        }


        switch (activeType) {
            case 'task':
                // A task's parent (list) doesn't impose drag restrictions itself, so isParentDragDisabled is false here.
                // The SortableContext handles list-level disabling.
                return <TaskItem task={item as Task} isParentDragDisabled={false} />;
            case 'subtask':
                 // Pass isSequenceLockedByParent for visual lock icon, pass false for isParentDragDisabled as the task doesn't disable drag overlay
                 return <SubtaskItem
                            subtask={item as Subtask}
                            isParentDragDisabled={false} // Overlay isn't disabled by task itself
                            isSequenceLocked={isSequenceLockedByParent} // Reflects Task's lock
                         />;
            case 'activity':
                 // Pass isSequenceLockedByParent for visual lock icon, pass false for isParentDragDisabled as subtask doesn't disable drag overlay
                 return <ActivityItem
                            activity={item as Activity}
                            isParentDragDisabled={false} // Overlay isn't disabled by subtask itself
                            isSequenceLocked={isSequenceLockedByParent} // Reflects Subtask's lock
                        />;
            default:
                return null;
        }
    };


  return (
    <Card className="mb-6 bg-secondary/50 shadow-inner">
       <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            {isEditingListName ? (
                 <Input
                    value={editedListName}
                    onChange={(e) => setEditedListName(e.target.value)}
                    onBlur={handleListNameBlur}
                    onKeyDown={handleListNameKeyDown}
                    autoFocus
                    className="text-xl font-semibold border-blue-400 h-8 mr-2 flex-grow"
                 />
            ) : (
                <CardTitle className="text-xl font-semibold cursor-pointer hover:text-primary flex-grow" onClick={() => setIsEditingListName(true)}>
                    {list.name}
                </CardTitle>
             )}
            <div className="flex items-center space-x-2">
                 <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSuggestSchedule}
                    disabled={isScheduling || list.tasks.length === 0}
                    className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                    >
                    {isScheduling ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <BrainCircuit className="mr-2 h-4 w-4" />
                    )}
                    Suggest Schedule
                </Button>
                 <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-8 w-8"
                            aria-label="Delete list"
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent card click or other parent handlers
                                setIsDeleteDialogOpen(true);
                            }}
                        >
                            <Trash2 size={16} />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            list "{list.name}" and all its tasks, subtasks, and activities.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteListConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
             </div>
        </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            type="text"
            placeholder="Add a new task..."
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-grow"
          />
          <Button onClick={handleAddTask} disabled={!newTaskName.trim()}>
            <Plus size={16} className="mr-2" /> Add Task
          </Button>
        </div>
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {list.tasks.length > 0 ? (
              list.tasks.map((task) => (
                <TaskItem key={task.id} task={task} isParentDragDisabled={!!activeId} /> // Pass activeId as parent drag disable flag
              ))
            ) : (
              <p className="text-center text-muted-foreground py-4">No tasks in this list yet.</p>
            )}
          </SortableContext>
           <DragOverlay dropAnimation={dropAnimation}>
                {renderActiveDragOverlay()}
            </DragOverlay>
        </DndContext>
      </CardContent>
    </Card>
  );
};

export default TaskList;
