// src/hooks/use-task-store.ts
import { create } from 'zustand';
import { produce } from 'immer';
import type { TaskList, Task, Subtask, Activity, Priority, Status, DescriptionHistoryEntry, Attachment } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { isPast, differenceInDays, addDays, isWithinInterval } from 'date-fns';
import { findItemInDraft, findItemRecursive, findParentListRecursive, getAllItemsRecursive, addHistoryEntry } from '@/lib/store-utils';

// Interface for items returned by getTodayItems
export interface TodayItem {
    id: string;
    parentId: string | null; // null for tasks
    grandparentId: string | null; // null for tasks and subtasks
    type: 'task' | 'subtask' | 'activity';
    name: string;
    priority: Priority;
    status: Status;
    creationDate: Date;
    expectedCompletionDate: Date;
    isOverdue: boolean;
    daysUntilDue: number;
    urgencyScore: number;
    listName?: string; // Only for tasks
    taskName?: string; // Only for subtasks/activities
    subtaskName?: string; // Only for activities
    // Include the original item for rendering/actions
    originalItem: Task | Subtask | Activity;
}

interface TaskStore {
  taskLists: TaskList[];
  isLoading: boolean;
  error: string | null;

  // Task List Actions
  addTaskList: (name: string) => void;
  updateTaskListName: (listId: string, newName: string) => void;
  deleteTaskList: (listId: string) => void;

  // Task Actions
  addTask: (listId: string, name: string, priority?: Priority, creationDate?: Date, expectedCompletionDate?: Date) => Task;
  updateTask: (taskId: string, updates: Partial<Omit<Task, 'id' | 'listId' | 'subtasks' | 'order' | 'descriptionHistory' | 'attachments' | 'schedule' | 'reminder'>>, options?: { skipStatusPropagation?: boolean }) => boolean | string; // Return true on success, error string on failure
  deleteTask: (taskId: string) => void;
  reorderTasks: (listId: string, taskIds: string[]) => void;

  // Subtask Actions
  addSubtask: (taskId: string, name: string, priority?: Priority) => Subtask | null;
  updateSubtask: (subtaskId: string, updates: Partial<Omit<Subtask, 'id' | 'parentId' | 'activities' | 'order' | 'descriptionHistory' | 'attachments' | 'schedule' | 'reminder'>>, options?: { skipStatusPropagation?: boolean }) => boolean | string; // Return true on success, error string on failure
  deleteSubtask: (subtaskId: string) => void;
  reorderSubtasks: (taskId: string, subtaskIds: string[]) => void;

  // Activity Actions
  addActivity: (subtaskId: string, name: string, priority?: Priority) => Activity | null;
  updateActivity: (activityId: string, updates: Partial<Omit<Activity, 'id' | 'parentId' | 'order' | 'descriptionHistory' | 'attachments' | 'schedule' | 'reminder' | 'autoRepeat' | 'autoRepeatSchedule' | 'lastInstanceDate' | 'notes' | 'numericValue' | 'isSkipped' | 'isDue' | 'dueCount'>>, options?: { skipStatusPropagation?: boolean }) => boolean | string; // Return true on success, error string on failure
  deleteActivity: (activityId: string) => void;
  reorderActivities: (subtaskId: string, activityIds: string[]) => void;

  // Attachment Actions
  addAttachment: (itemId: string, attachment: Omit<Attachment, 'id' | 'timestamp'>) => string | null; // Returns new attachment ID or null
  deleteAttachment: (itemId: string, attachmentId: string) => boolean; // Returns true on success

  // Find Helper (for external/read-only use)
  findItem: (id: string) => { type: 'task' | 'subtask' | 'activity' | 'taskList'; item: Task | Subtask | Activity | TaskList; parent?: { type: 'task' | 'subtask' | 'taskList'; item: Task | Subtask | TaskList } } | undefined;
  findParentList: (itemId: string) => TaskList | undefined;
  getAllItems: () => (Task | Subtask | Activity)[]; // Helper to get all items for history
  getRawTaskLists: () => TaskList[]; // Helper to get raw data for export
  getTodayItems: () => TodayItem[]; // Selector for the "Today" view

  // Serial Completion Check
  canStartItem: (itemId: string) => boolean;
  canChangeStatus: (itemId: string, newStatus: Status) => boolean | string; // Check if status change is allowed

  // Loading/Error state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Internal helper (not exported)
  _propagateStatusUpwards: (itemId: string) => void;

  // Phase 1: Scheduling & Reminder Actions for Activity
  toggleActivityAutoRepeat: (activityId: string, isAutoRepeat: boolean) => void;
  updateActivitySchedule: (activityId: string, schedule: Activity['schedule']) => void;
  updateActivityReminder: (activityId: string, reminder: Activity['reminder']) => void;

  // Phase 1: Scheduling & Reminder Actions for Subtask
  toggleSubtaskAutoRepeat: (subtaskId: string, isAutoRepeat: boolean) => void;
  updateSubtaskSchedule: (subtaskId: string, schedule: Subtask['schedule']) => void;
  updateSubtaskReminder: (subtaskId: string, reminder: Subtask['reminder']) => void;

  // Phase 1: Scheduling & Reminder Actions for Task
  toggleTaskAutoRepeat: (taskId: string, isAutoRepeat: boolean) => void;
  updateTaskSchedule: (taskId: string, schedule: Task['schedule']) => void;
  updateTaskReminder: (taskId: string, reminder: Task['reminder']) => void;
}


// --- Zustand Store Definition ---
const useTaskStore = create<TaskStore>((set, get) => {

  // --- Status Propagation Logic ---
  const propagateStatusUpwards = (draft: TaskStore, itemId: string) => {
    // This function is currently disabled as requested.
    return;
  };

  // --- Status Validation Logic ---
   const canChangeStatus = (itemId: string, newStatus: Status): boolean | string => {
       // This function is currently disabled as requested.
       return true;
   };

    // --- Today View Selector Logic ---
    const getTodayItems = (): TodayItem[] => {
        const state = get();
        const allItems = state.getAllItems();
        const today = new Date();
        const todayItems: TodayItem[] = [];

        const priorityScore: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
        const statusScore: Record<Status, number> = { inprogress: 4, started: 3, todo: 2, done: 0 }; // Prioritize active items


        allItems.forEach(item => {
            if (item.status === 'done') return; // Skip completed items

            const isHighOrMedium = item.priority === 'high' || item.priority === 'medium';
            if (!isHighOrMedium) return; // Skip low priority unless overdue

            const expectedDate = item.expectedCompletionDate;
            const isOverdue = isPast(expectedDate) && item.status !== 'done';
            const daysUntilDue = differenceInDays(expectedDate, today);

            // Include high/medium priority items due soon or overdue
            const isDueSoon = daysUntilDue <= 7; // Example: include items due within a week

            if (isOverdue || isDueSoon) {
                // Urgency calculation (example):
                // Higher score for higher priority, more active status, closer due date (negative for overdue)
                let urgencyScore = priorityScore[item.priority] * 10;
                urgencyScore += statusScore[item.status] * 5;
                urgencyScore -= daysUntilDue; // Closer due date increases score (overdue are negative, increasing score)
                if (isOverdue) urgencyScore += 10; // Extra boost for overdue

                 // Find parent and grandparent names
                 let listName: string | undefined;
                 let taskName: string | undefined;
                 let subtaskName: string | undefined;
                 let parentId: string | null = null;
                 let grandparentId: string | null = null;

                 const parentList = state.findParentList(item.id);
                 listName = parentList?.name;

                 if ('parentId' in item) { // Subtask or Activity
                    parentId = item.parentId;
                    const parentResult = state.findItem(item.parentId);
                     if (parentResult?.type === 'task') {
                         taskName = parentResult.item.name;
                         grandparentId = (parentResult.item as Task).listId;
                    } else if (parentResult?.type === 'subtask') {
                        subtaskName = parentResult.item.name;
                        grandparentId = (parentResult.item as Subtask).parentId;
                        // Find task name for activity
                         const grandparentResult = state.findItem(grandparentId);
                         if (grandparentResult?.type === 'task') {
                             taskName = grandparentResult.item.name;
                         }
                    }
                 } else if ('listId' in item) { // Task
                      parentId = (item as Task).listId;
                 }


                 todayItems.push({
                    id: item.id,
                    parentId: parentId,
                    grandparentId: grandparentId,
                    type: 'listId' in item ? 'task' : 'activities' in item ? 'subtask' : 'activity',
                    name: item.name,
                    priority: item.priority,
                    status: item.status,
                    creationDate: item.creationDate,
                    expectedCompletionDate: item.expectedCompletionDate,
                    isOverdue,
                    daysUntilDue,
                    urgencyScore,
                    listName,
                    taskName,
                    subtaskName,
                    originalItem: item,
                 });

            }
        });

        // Sort by urgency score (descending)
        todayItems.sort((a, b) => b.urgencyScore - a.urgencyScore);

        return todayItems;
    };

    // Define the initial state, ensuring it includes the default list
    const initialState: { taskLists: TaskList[]; isLoading: boolean; error: string | null } = {
        taskLists: [{ id: 'default-list', name: 'Project', tasks: [] }],
        isLoading: false,
        error: null,
    };


    return {
        ...initialState, // Spread the initial state

        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),

        // --- Task List Actions ---
        addTaskList: (name) => set(produce((draft) => {
            const newList: TaskList = { id: uuidv4(), name, tasks: [] };
            draft.taskLists.push(newList);
        })),

        updateTaskListName: (listId, newName) => set(produce((draft) => {
            const list = draft.taskLists.find(l => l.id === listId);
            if (list) {
            list.name = newName;
            }
        })),

        deleteTaskList: (listId) => set(produce((draft: TaskStore) => {
            draft.taskLists = draft.taskLists.filter(l => l.id !== listId);
            // No longer adding a default list if all are deleted
        })),

        // --- Task Actions ---
        addTask: (listId, name, priority = 'medium', creationDate = new Date(), expectedCompletionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) => {
            // Ensure expected completion date is not before creation date
            if (expectedCompletionDate < creationDate) {
                expectedCompletionDate = new Date(creationDate.getTime() + 7 * 24 * 60 * 60 * 1000); // Default to 1 week after creation
            }
            const now = new Date();
            const newTask: Task = {
                id: uuidv4(),
                listId,
                name,
                description: '',
                creationDate: creationDate, // Use provided or default
                expectedCompletionDate: expectedCompletionDate,
                actualCompletionDate: undefined,
                lastEditedDate: now, // Set initial last edited date
                status: 'todo', // Initial status
                priority,
                order: 0, // Will be recalculated on add
                serialCompletionMandatory: false,
                sequenceMandatory: false, // Initialize sequenceMandatory
                subtasks: [],
                dependencies: [],
                descriptionHistory: [], // Initialize history
                attachments: [], // Initialize attachments
                autoRepeat: false, // Phase 1
                schedule: { recurrenceRule: '', specificTimes: [], timeZone: '' }, // Phase 1
                reminder: { remindAt: '', message: '' }, // Phase 1
            };
            let addedTask: Task | null = null;
            set(produce((draft: TaskStore) => {
                const list = draft.taskLists.find(l => l.id === listId);
                if (list) {
                    newTask.order = list.tasks.length; // Append to the end initially
                    // Create a mutable copy for the draft state
                    const mutableNewTask = { ...newTask };
                    list.tasks.push(mutableNewTask);
                    addedTask = mutableNewTask; // Assign the mutable copy
                }
            }));
            return addedTask!; // Return the added task
        },


       updateTask: (taskId, updates, options = {}) => {
           let success: boolean | string = false;
           set(produce((draft: TaskStore) => {
               const result = findItemInDraft(draft, taskId);
               if (!result || result.type !== 'task') {
                   success = `Task with ID ${taskId} not found.`;
                   return;
               }
               const taskToUpdate = result.item as Task;
               const parentList = result.parent?.item as TaskList;

               if (!taskToUpdate || !parentList) {
                   success = `Task context not found for ID ${taskId}.`;
                   return;
               }

               const oldStatus = taskToUpdate.status;
               const oldDescription = taskToUpdate.description || '';
               let changed = false;
               const now = new Date();

               // Status tracking is currently disabled.
               // const canChange = get().canChangeStatus(taskId, updates.status || oldStatus);
               // if (canChange !== true) {
               //     success = canChange;
               //     return;
               // }


               // Handle history entries BEFORE applying changes
               if (updates.description !== undefined && updates.description !== oldDescription) {
                   addHistoryEntry(taskToUpdate, taskToUpdate.lastEditedDate, `[EDIT] ${oldDescription || '(empty)'}`);
                   changed = true;
               }
               // Status change history is disabled
               // if (updates.status && updates.status !== oldStatus) {
               //    addHistoryEntry(taskToUpdate, now, `[STATUS] Status changed from '${oldStatus}' to '${updates.status}'`);
               //    changed = true;
               // }


               // Apply updates
               for (const key in updates) {
                   if (Object.prototype.hasOwnProperty.call(updates, key)) {
                       const newValue = (updates as any)[key];
                       const oldValue = (taskToUpdate as any)[key];

                        // Normalize undefined/empty strings for description check
                        if (key === 'description') {
                             if ((newValue || '') !== (oldValue || '')) {
                                (taskToUpdate as any)[key] = newValue || undefined; // Store empty string as undefined
                                changed = true;
                             }
                        } else if (key === 'creationDate' || key === 'expectedCompletionDate' || key === 'actualCompletionDate') {
                            // Ensure dates are Date objects
                             const newDate = newValue ? new Date(newValue) : undefined;
                             const oldDate = oldValue ? new Date(oldValue) : undefined;
                             if (newDate?.getTime() !== oldDate?.getTime()) {
                                 (taskToUpdate as any)[key] = newDate;
                                 changed = true;

                                // Date validation (expected >= creation, within parent bounds etc.)
                                if (key === 'expectedCompletionDate') {
                                    const currentCreation = taskToUpdate.creationDate;
                                    if (newDate && newDate < currentCreation) {
                                        console.warn(`Task ${taskId}: Expected completion adjusted to creation date.`);
                                        taskToUpdate.expectedCompletionDate = currentCreation;
                                    }
                                }
                                if (key === 'creationDate') {
                                    const currentExpected = taskToUpdate.expectedCompletionDate;
                                     if (newDate && newDate > currentExpected) {
                                        console.warn(`Task ${taskId}: Creation date adjusted to expected completion date.`);
                                         taskToUpdate.creationDate = currentExpected;
                                     }
                                }
                            }
                        } else if (key === 'schedule' || key === 'reminder') { // Phase 1: Handle schedule/reminder updates
                            (taskToUpdate as any)[key] = newValue;
                            changed = true;
                        } else if (oldValue !== newValue) {
                           (taskToUpdate as any)[key] = newValue;
                           changed = true;
                       }
                   }
               }


               // Handle 'done' status setting actualCompletionDate - Status tracking disabled
               // if (updates.status === 'done' && oldStatus !== 'done') {
               //     taskToUpdate.actualCompletionDate = now;
               //     changed = true;
               // } else if (updates.status && updates.status !== 'done' && oldStatus === 'done') {
               //     taskToUpdate.actualCompletionDate = undefined;
               //     changed = true;
               // }

               // Update lastEditedDate only if something actually changed
               if (changed) {
                   taskToUpdate.lastEditedDate = now;
               }

               // Propagate date changes down if necessary
                if (updates.creationDate || updates.expectedCompletionDate) {
                    const subtasks = taskToUpdate.subtasks || [];
                    subtasks.forEach(subtask => {
                        let subtaskUpdated = false;
                        if (taskToUpdate!.creationDate && subtask.creationDate < taskToUpdate!.creationDate) {
                            subtask.creationDate = taskToUpdate!.creationDate; subtaskUpdated = true;
                        }
                        if (taskToUpdate!.expectedCompletionDate && subtask.expectedCompletionDate > taskToUpdate!.expectedCompletionDate) {
                            subtask.expectedCompletionDate = taskToUpdate!.expectedCompletionDate; subtaskUpdated = true;
                        }
                        if (subtask.expectedCompletionDate < subtask.creationDate) {
                            subtask.expectedCompletionDate = subtask.creationDate; subtaskUpdated = true;
                        }
                        if (subtaskUpdated) subtask.lastEditedDate = now;

                        const activities = subtask.activities || [];
                        activities.forEach(activity => {
                            let activityUpdated = false;
                            if (subtask.creationDate && activity.creationDate < subtask.creationDate) {
                                activity.creationDate = subtask.creationDate; activityUpdated = true;
                            }
                            if (subtask.expectedCompletionDate && activity.expectedCompletionDate > subtask.expectedCompletionDate) {
                                activity.expectedCompletionDate = subtask.expectedCompletionDate; activityUpdated = true;
                            }
                            if (activity.expectedCompletionDate < activity.creationDate) {
                                activity.expectedCompletionDate = activity.creationDate; activityUpdated = true;
                            }
                            if (activityUpdated) activity.lastEditedDate = now;
                        });
                    });
                }


               success = true; // Mark as successful
           }));
           return success;
       },


        deleteTask: (taskId) => set(produce((draft: TaskStore) => {
            for (const list of draft.taskLists) {
            const initialLength = list.tasks.length;
            list.tasks = list.tasks.filter(t => t.id !== taskId);
            // Re-order remaining tasks if one was removed
            if (list.tasks.length < initialLength) {
                list.tasks.forEach((t, index) => t.order = index);
                return; // Exit once found and deleted
            }
            }
        })),

        reorderTasks: (listId, taskIds) => set(produce((draft: TaskStore) => {
            const list = draft.taskLists.find(l => l.id === listId);
            if (list) {
            const newOrderMap = new Map<string, number>();
            taskIds.forEach((id, index) => newOrderMap.set(id, index));
            list.tasks.forEach(task => {
                const newOrder = newOrderMap.get(task.id);
                if (newOrder !== undefined) {
                task.order = newOrder;
                }
            });
            // Sort the array based on the new order
            list.tasks.sort((a, b) => a.order - b.order);
            }
        })),


        // --- Subtask Actions ---
        addSubtask: (taskId, name, priority = 'medium') => {
            let newSubtask: Subtask | null = null;
            const now = new Date();
            set(produce((draft: TaskStore) => {
                const result = findItemInDraft(draft, taskId);
                if (!result || result.type !== 'task') {
                     console.error(`addSubtask: Parent task with ID ${taskId} not found.`);
                     return;
                }
                const parentTask = result.item as Task;

                // Ensure subtasks array exists and is mutable
                if (!parentTask.subtasks) parentTask.subtasks = [];

                // Inherit dates, ensure expectedCompletionDate >= creationDate
                let subtaskCreationDate = parentTask.creationDate;
                let subtaskExpectedCompletionDate = parentTask.expectedCompletionDate;
                if (subtaskExpectedCompletionDate < subtaskCreationDate) {
                    subtaskExpectedCompletionDate = subtaskCreationDate;
                }

                const subtaskToAdd: Subtask = {
                    id: uuidv4(),
                    parentId: taskId,
                    name,
                    description: '',
                    creationDate: subtaskCreationDate,
                    expectedCompletionDate: subtaskExpectedCompletionDate,
                    actualCompletionDate: undefined,
                    lastEditedDate: now,
                    status: 'todo', // Initial status
                    priority,
                    order: parentTask.subtasks.length, // Assign next order
                    serialCompletionMandatory: false,
                    sequenceMandatory: false,
                    activities: [],
                    dependencies: [],
                    descriptionHistory: [],
                    attachments: [], // Initialize attachments
                    autoRepeat: false, // Phase 1
                    schedule: { recurrenceRule: '', specificTimes: [], timeZone: '' }, // Phase 1
                    reminder: { remindAt: '', message: '' }, // Phase 1
                };

                parentTask.subtasks.push(subtaskToAdd); // Push the plain object

                parentTask.lastEditedDate = now; // Update parent's last edited date
                newSubtask = subtaskToAdd; // Assign the added subtask

                // propagateStatusUpwards(draft, taskId);
            }));
            return newSubtask; // Return the created subtask or null
        },

        updateSubtask: (subtaskId, updates, options = {}) => {
            let success: boolean | string = false;
            set(produce((draft: TaskStore) => {
                const result = findItemInDraft(draft, subtaskId);
                if (!result || result.type !== 'subtask') {
                    success = `Subtask with ID ${subtaskId} not found.`;
                    return;
                }
                const subtaskToUpdate = result.item as Subtask;
                const parentTask = result.parent?.item as Task;

                if (!subtaskToUpdate || !parentTask) {
                    success = `Subtask context not found for ID ${subtaskId}.`;
                    return;
                }

                const oldStatus = subtaskToUpdate.status;
                const oldDescription = subtaskToUpdate.description || '';
                let changed = false;
                const now = new Date();

                 // Status tracking is currently disabled.
                // const canChange = get().canChangeStatus(subtaskId, updates.status || oldStatus);
                // if (canChange !== true) {
                //     success = canChange;
                //     return;
                // }

                // Handle history entries before applying changes
                 if (updates.description !== undefined && updates.description !== oldDescription) {
                    addHistoryEntry(subtaskToUpdate, subtaskToUpdate.lastEditedDate, `[EDIT] ${oldDescription || '(empty)'}`);
                    changed = true;
                 }
                 // Status change history disabled
                //  if (updates.status && updates.status !== oldStatus) {
                //     addHistoryEntry(subtaskToUpdate, now, `[STATUS] Status changed from '${oldStatus}' to '${updates.status}'`);
                //     changed = true;
                //  }

                // Apply updates
                for (const key in updates) {
                    if (Object.prototype.hasOwnProperty.call(updates, key)) {
                       const newValue = (updates as any)[key];
                       const oldValue = (subtaskToUpdate as any)[key];

                        if (key === 'description') {
                            if ((newValue || '') !== (oldValue || '')) {
                                (subtaskToUpdate as any)[key] = newValue || undefined;
                                changed = true;
                            }
                        } else if (key === 'creationDate' || key === 'expectedCompletionDate' || key === 'actualCompletionDate') {
                             const newDate = newValue ? new Date(newValue) : undefined;
                             const oldDate = oldValue ? new Date(oldValue) : undefined;
                             if (newDate?.getTime() !== oldDate?.getTime()) {
                                (subtaskToUpdate as any)[key] = newDate;
                                changed = true;

                                // Date validation
                                const parentCreation = parentTask.creationDate;
                                const parentExpected = parentTask.expectedCompletionDate;
                                if (key === 'creationDate' && newDate && parentCreation && newDate < parentCreation) {
                                     console.warn(`Subtask ${subtaskId}: Creation date adjusted to parent task's.`);
                                    subtaskToUpdate.creationDate = parentCreation;
                                }
                                if (key === 'expectedCompletionDate' && newDate && parentExpected && newDate > parentExpected) {
                                    console.warn(`Subtask ${subtaskId}: Expected completion adjusted to parent task's.`);
                                    subtaskToUpdate.expectedCompletionDate = parentExpected;
                                }
                                 if (subtaskToUpdate.expectedCompletionDate < subtaskToUpdate.creationDate) {
                                     console.warn(`Subtask ${subtaskId}: Expected completion adjusted to creation date.`);
                                     subtaskToUpdate.expectedCompletionDate = subtaskToUpdate.creationDate;
                                 }
                             }
                        } else if (key === 'schedule' || key === 'reminder') { // Phase 1: Handle schedule/reminder updates
                            (subtaskToUpdate as any)[key] = newValue;
                            changed = true;
                        } else if (oldValue !== newValue) {
                           (subtaskToUpdate as any)[key] = newValue;
                           changed = true;
                       }
                   }
               }

                // Handle 'done' status - Status tracking disabled
                // if (updates.status === 'done' && oldStatus !== 'done') {
                //     subtaskToUpdate.actualCompletionDate = now;
                //     changed = true;
                // } else if (updates.status && updates.status !== 'done' && oldStatus === 'done') {
                //     subtaskToUpdate.actualCompletionDate = undefined;
                //     changed = true;
                // }

                // Update lastEditedDate only if changed
                if (changed) {
                    subtaskToUpdate.lastEditedDate = now;
                    parentTask.lastEditedDate = now; // Also update parent task
                }


                // Propagate date changes down
                if (updates.creationDate || updates.expectedCompletionDate) {
                    if (!subtaskToUpdate.activities) subtaskToUpdate.activities = [];
                    subtaskToUpdate.activities.forEach(activity => {
                        let activityUpdated = false;
                        if (subtaskToUpdate!.creationDate && activity.creationDate < subtaskToUpdate!.creationDate) {
                            activity.creationDate = subtaskToUpdate!.creationDate; activityUpdated = true;
                        }
                        if (subtaskToUpdate!.expectedCompletionDate && activity.expectedCompletionDate > subtaskToUpdate!.expectedCompletionDate) {
                            activity.expectedCompletionDate = subtaskToUpdate!.expectedCompletionDate; activityUpdated = true;
                        }
                        if (activity.expectedCompletionDate < activity.creationDate) {
                            activity.expectedCompletionDate = activity.creationDate; activityUpdated = true;
                        }
                        if (activityUpdated) activity.lastEditedDate = now;
                    });
                }

                success = true; // Mark as successful
            }));
            return success;
        },


        deleteSubtask: (subtaskId) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, subtaskId);
            if (!result || result.type !== 'subtask' || !result.parent || result.parent.type !== 'task') return;

            const parentTask = result.parent.item as Task;

            if (parentTask && parentTask.subtasks) {
                const initialLength = parentTask.subtasks.length;
                parentTask.subtasks = parentTask.subtasks.filter(st => st.id !== subtaskId);
                if (parentTask.subtasks.length < initialLength) {
                    parentTask.subtasks.forEach((st, index) => st.order = index);
                    parentTask.lastEditedDate = new Date(); // Update parent
                     // propagateStatusUpwards(draft, parentTask.id);
                }
            }
        })),

        reorderSubtasks: (taskId, subtaskIds) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, taskId);
             if (!result || result.type !== 'task') return; // Task not found
             const parentTask = result.item as Task;

            if (!parentTask.subtasks) parentTask.subtasks = [];

            if (!parentTask.sequenceMandatory) {
                const newOrderMap = new Map<string, number>();
                subtaskIds.forEach((id, index) => newOrderMap.set(id, index));

                parentTask.subtasks.forEach(subtask => {
                    const newOrder = newOrderMap.get(subtask.id);
                    if (newOrder !== undefined) {
                    subtask.order = newOrder;
                    }
                });
                parentTask.subtasks.sort((a, b) => a.order - b.order);
                parentTask.lastEditedDate = new Date(); // Update parent
            } else {
                console.warn(`Reordering subtasks for task ${taskId} blocked due to sequenceMandatory flag.`);
            }
        })),


        // --- Activity Actions ---
        addActivity: (subtaskId, name, priority = 'medium') => {
            let newActivity: Activity | null = null;
            const now = new Date();
            set(produce((draft: TaskStore) => {
                 const result = findItemInDraft(draft, subtaskId);
                 if (!result || result.type !== 'subtask' || !result.parent || result.parent.type !== 'task') {
                      console.error(`addActivity: Parent subtask with ID ${subtaskId} or its task not found.`);
                      return;
                 }
                 const parentSubtask = result.item as Subtask;
                 const parentTask = result.parent.item as Task;

                 // Ensure activities array exists and is mutable
                 if (!parentSubtask.activities) parentSubtask.activities = [];

                 // Inherit dates, ensure expectedCompletionDate >= creationDate
                 let activityCreationDate = parentSubtask.creationDate;
                 let activityExpectedCompletionDate = parentSubtask.expectedCompletionDate;
                 if (activityExpectedCompletionDate < activityCreationDate) {
                     activityExpectedCompletionDate = activityCreationDate;
                 }

                 const activityToAdd: Activity = {
                     id: uuidv4(),
                     parentId: subtaskId,
                     name,
                     description: '',
                     creationDate: activityCreationDate,
                     expectedCompletionDate: activityExpectedCompletionDate,
                     actualCompletionDate: undefined,
                     lastEditedDate: now,
                     status: 'todo', // Initial status
                     priority,
                     order: parentSubtask.activities.length, // Assign next order
                     descriptionHistory: [],
                     attachments: [], // Initialize attachments
                     // Phase 1: Scheduling fields
                     autoRepeat: false,
                     schedule: { recurrenceRule: '', specificTimes: [], timeZone: '' },
                     reminder: { remindAt: '', message: '' },
                     lastInstanceDate: undefined, // For tracking repeated activities
                     // Phase 1: Activity specific fields for auto-repeat
                     notes: '',
                     numericValue: undefined,
                     isSkipped: false,
                     isDue: false,
                     dueCount: 0,
                 };

                 parentSubtask.activities.push(activityToAdd); // Push plain object

                 parentSubtask.lastEditedDate = now; // Update subtask
                 parentTask.lastEditedDate = now; // Update task
                 newActivity = activityToAdd;

                 // propagateStatusUpwards(draft, subtaskId);

            }));
            return newActivity; // Return the created activity or null
        },

       updateActivity: (activityId, updates, options = {}) => {
            let success: boolean | string = false;
           set(produce((draft: TaskStore) => {
               const result = findItemInDraft(draft, activityId);
               if (!result || result.type !== 'activity') {
                   success = `Activity with ID ${activityId} not found.`;
                   return;
               }
               const activityToUpdate = result.item as Activity;
               const parentSubtask = result.parent?.item as Subtask;
               const parentTaskResult = parentSubtask ? findItemInDraft(draft, parentSubtask.parentId) : undefined;
               const parentTask = parentTaskResult?.item as Task;

               if (!activityToUpdate || !parentSubtask || !parentTask) {
                   success = `Activity context not found for ID ${activityId}.`;
                   return;
               }

               const oldStatus = activityToUpdate.status;
               const oldDescription = activityToUpdate.description || '';
               let changed = false;
               const now = new Date();

                // Status tracking is currently disabled.
                // const canChange = get().canChangeStatus(activityId, updates.status || oldStatus);
                // if (canChange !== true) {
                //     success = canChange;
                //     return;
                // }


               // Handle history entries before applying changes
               if (updates.description !== undefined && updates.description !== oldDescription) {
                  addHistoryEntry(activityToUpdate, activityToUpdate.lastEditedDate, `[EDIT] ${oldDescription || '(empty)'}`);
                   changed = true;
               }
               // Status change history disabled
                // if (updates.status && updates.status !== oldStatus) {
                //    addHistoryEntry(activityToUpdate, now, `[STATUS] Status changed from '${oldStatus}' to '${updates.status}'`);
                //     changed = true;
                // }

                // Phase 1: Log schedule, reminder, due, skip changes
                if (updates.schedule && JSON.stringify(updates.schedule) !== JSON.stringify(activityToUpdate.schedule)) {
                     addHistoryEntry(activityToUpdate, now, `[SCHEDULE] Schedule updated to: ${updates.schedule.recurrenceRule || 'none'}`);
                     changed = true;
                }
                if (updates.reminder && JSON.stringify(updates.reminder) !== JSON.stringify(activityToUpdate.reminder)) {
                    addHistoryEntry(activityToUpdate, now, `[REMINDER] Reminder updated.`);
                     changed = true;
                }
                if (updates.isDue !== undefined && updates.isDue !== activityToUpdate.isDue) {
                    if(updates.isDue) {
                        const newDueCount = (activityToUpdate.dueCount || 0) + 1;
                        addHistoryEntry(activityToUpdate, now, `[DUE] Marked due (Count: ${newDueCount}).`);
                        (updates as Partial<Activity>).dueCount = newDueCount; // Ensure dueCount is updated if isDue is true
                    }
                    changed = true;
                }
                if (updates.isSkipped !== undefined && updates.isSkipped !== activityToUpdate.isSkipped) {
                     if(updates.isSkipped) addHistoryEntry(activityToUpdate, now, `[SKIP] Marked skipped.`);
                     changed = true;
                }


               // Apply updates
                for (const key in updates) {
                   if (Object.prototype.hasOwnProperty.call(updates, key)) {
                       const newValue = (updates as any)[key];
                       const oldValue = (activityToUpdate as any)[key];

                        if (key === 'description') {
                            if ((newValue || '') !== (oldValue || '')) {
                                (activityToUpdate as any)[key] = newValue || undefined;
                                changed = true;
                            }
                        } else if (key === 'creationDate' || key === 'expectedCompletionDate' || key === 'actualCompletionDate') {
                           const newDate = newValue ? new Date(newValue) : undefined;
                           const oldDate = oldValue ? new Date(oldValue) : undefined;
                           if (newDate?.getTime() !== oldDate?.getTime()) {
                               (activityToUpdate as any)[key] = newDate;
                               changed = true;

                                // Date validation
                               const parentCreation = parentSubtask.creationDate;
                               const parentExpected = parentSubtask.expectedCompletionDate;
                               if (key === 'creationDate' && newDate && parentCreation && newDate < parentCreation) {
                                   console.warn(`Activity ${activityId}: Creation date adjusted to parent subtask's.`);
                                   activityToUpdate.creationDate = parentCreation;
                               }
                               if (key === 'expectedCompletionDate' && newDate && parentExpected && newDate > parentExpected) {
                                   console.warn(`Activity ${activityId}: Expected completion adjusted to parent subtask's.`);
                                   activityToUpdate.expectedCompletionDate = parentExpected;
                               }
                                if (activityToUpdate.expectedCompletionDate < activityToUpdate.creationDate) {
                                    console.warn(`Activity ${activityId}: Expected completion adjusted to creation date.`);
                                    activityToUpdate.expectedCompletionDate = activityToUpdate.creationDate;
                                }
                           }
                        } else if (key === 'schedule' || key === 'reminder' || key === 'autoRepeat' || key === 'notes' || key === 'numericValue' || key === 'isSkipped' || key === 'isDue' || key === 'dueCount') {
                             (activityToUpdate as any)[key] = newValue;
                             changed = true;
                        }
                         else if (oldValue !== newValue) {
                           (activityToUpdate as any)[key] = newValue;
                           changed = true;
                       }
                   }
               }

               // Handle 'done' status - Status tracking disabled
                // if (updates.status === 'done' && oldStatus !== 'done') {
                //     activityToUpdate.actualCompletionDate = now;
                //     changed = true;
                // } else if (updates.status && updates.status !== 'done' && oldStatus === 'done') {
                //     activityToUpdate.actualCompletionDate = undefined;
                //     changed = true;
                // }

               // Update lastEditedDate only if changed
               if (changed) {
                   activityToUpdate.lastEditedDate = now;
                   parentSubtask.lastEditedDate = now; // Update subtask
                   parentTask.lastEditedDate = now; // Update task
               }

               success = true; // Mark as successful
           }));
            return success;
       },

        deleteActivity: (activityId) => set(produce((draft: TaskStore) => {
             const result = findItemInDraft(draft, activityId);
             if (!result || result.type !== 'activity' || !result.parent || result.parent.type !== 'subtask') return;

             const parentSubtask = result.parent.item as Subtask;
             const parentTaskResult = findItemInDraft(draft, parentSubtask.parentId);
             const parentTask = parentTaskResult?.item as Task;

            if (parentSubtask && parentSubtask.activities && parentTask) {
                const initialLength = parentSubtask.activities.length;
                parentSubtask.activities = parentSubtask.activities.filter(a => a.id !== activityId);
                if (parentSubtask.activities.length < initialLength) {
                    parentSubtask.activities.forEach((a, index) => a.order = index);
                    const now = new Date();
                    parentSubtask.lastEditedDate = now; // Update subtask
                    parentTask.lastEditedDate = now; // Update task
                }
            }
        })),

        reorderActivities: (subtaskId, activityIds) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, subtaskId);
            if (!result || result.type !== 'subtask' || !result.parent || result.parent.type !== 'task') return;

            const parentSubtask = result.item as Subtask;
            const parentTask = result.parent.item as Task;

            if (!parentSubtask) return; // Subtask not found
            if (!parentSubtask.activities) parentSubtask.activities = [];

            if (!parentSubtask.sequenceMandatory && parentTask) {
                const newOrderMap = new Map<string, number>();
                activityIds.forEach((id, index) => newOrderMap.set(id, index));

                parentSubtask.activities.forEach(activity => {
                    const newOrder = newOrderMap.get(activity.id);
                    if (newOrder !== undefined) {
                    activity.order = newOrder;
                    }
                });
                parentSubtask.activities.sort((a, b) => a.order - b.order);
                const now = new Date();
                parentSubtask.lastEditedDate = now; // Update subtask
                parentTask.lastEditedDate = now; // Update task
            } else if (parentSubtask.sequenceMandatory) {
                console.warn(`Reordering activities for subtask ${subtaskId} blocked due to sequenceMandatory flag.`);
            }
        })),

        // --- Attachment Actions ---
        addAttachment: (itemId, attachmentData) => {
            let newAttachmentId: string | null = null;
            set(produce((draft: TaskStore) => {
                const result = findItemInDraft(draft, itemId);
                if (!result || result.type === 'taskList') {
                    console.error(`Cannot add attachment: Item with ID ${itemId} not found or is a TaskList.`);
                    return;
                }
                const item = result.item as Task | Subtask | Activity;
                const now = new Date();
                if (!item.attachments) {
                    item.attachments = [];
                }
                const newAttachment: Attachment = {
                    ...attachmentData,
                    id: uuidv4(),
                    timestamp: now,
                };
                item.attachments.push(newAttachment);
                item.lastEditedDate = now; // Update last edited date
                 newAttachmentId = newAttachment.id;

                // Update parent timestamps as well
                if (result.parent) {
                    const parentItem = result.parent.item as Task | Subtask;
                    parentItem.lastEditedDate = now;
                    if (result.parent.type !== 'taskList') { // Check if there's a grandparent task
                        const grandParentResult = findItemInDraft(draft, parentItem.parentId);
                        if (grandParentResult && grandParentResult.type === 'task') {
                             (grandParentResult.item as Task).lastEditedDate = now;
                        }
                    }
                }


            }));
            return newAttachmentId;
        },

        deleteAttachment: (itemId, attachmentId) => {
            let deleted = false;
            set(produce((draft: TaskStore) => {
                 const result = findItemInDraft(draft, itemId);
                 if (!result || result.type === 'taskList' || !result.item.attachments) {
                     console.error(`Cannot delete attachment: Item ${itemId} not found, is a TaskList, or has no attachments.`);
                     return;
                 }
                 const item = result.item as Task | Subtask | Activity;
                 const initialLength = item.attachments.length;
                 item.attachments = item.attachments.filter(att => att.id !== attachmentId);
                 if (item.attachments.length < initialLength) {
                     deleted = true;
                     const now = new Date();
                     item.lastEditedDate = now; // Update last edited date

                     // Update parent timestamps
                     if (result.parent) {
                         const parentItem = result.parent.item as Task | Subtask;
                         parentItem.lastEditedDate = now;
                         if (result.parent.type !== 'taskList') {
                             const grandParentResult = findItemInDraft(draft, parentItem.parentId);
                             if (grandParentResult && grandParentResult.type === 'task') {
                                  (grandParentResult.item as Task).lastEditedDate = now;
                             }
                         }
                     }

                 }
            }));
            return deleted;
        },

        // --- Find Helper (Uses non-draft state via get()) ---
        findItem: (id) => findItemRecursive(id, get().taskLists),
        findParentList: (itemId) => findParentListRecursive(itemId, get().taskLists),
        getAllItems: () => getAllItemsRecursive(get().taskLists), // Use helper
        getRawTaskLists: () => get().taskLists, // Simple getter for export
        getTodayItems: getTodayItems, // Add the selector


        // --- Serial Completion Check ---
        canStartItem: (itemId) => {
            const state = get(); // Use current state for checking
            const result = state.findItem(itemId);
            if (!result) return false; // Item not found

            const { type, item, parent } = result;

            let siblings: (Task | Subtask | Activity)[] = [];
            let serialMandatory = false;

            // Determine siblings and serial status based on item type and parent
            if (type === 'task' && parent && parent.type === 'taskList') {
                 return true;
            } else if (type === 'subtask' && parent && parent.type === 'task') { // Subtask within a Task
            const parentTask = parent.item as Task;
            siblings = parentTask.subtasks || [];
            serialMandatory = parentTask.serialCompletionMandatory;
            } else if (type === 'activity' && parent && parent.type === 'subtask') { // Activity within a Subtask
            const parentSubtask = parent.item as Subtask;
            siblings = parentSubtask.activities || [];
            serialMandatory = parentSubtask.serialCompletionMandatory;
            } else if (type === 'taskList') {
                return true; // TaskLists can always "start"
            }
            else {
                console.warn(`canStartItem: Could not determine context for item ${itemId} with type ${type}`);
                return true; // Default to true if context is unclear
            }


            if (!serialMandatory) return true; // Not serial, can start anytime

            const currentOrder = item.order;
            if (currentOrder === undefined) {
                console.warn(`canStartItem: Item ${itemId} has undefined order.`);
                return true;
            }


            // Check if all preceding siblings (with lower order) are 'done'
            for (const sibling of siblings) {
            if (sibling.id === item.id) continue;
            if (sibling.order === undefined) continue;

            if (sibling.order < currentOrder && sibling.status !== 'done') {
                return false; // A preceding sibling is not done
            }
            }

            return true; // All preceding siblings are done
        },

         _propagateStatusUpwards: (itemId: string) => {
            set(produce((draft: TaskStore) => {
                propagateStatusUpwards(draft, itemId);
            }));
         },
        canChangeStatus: canChangeStatus,

        // Phase 1: Activity Schedule/Reminder Actions
        toggleActivityAutoRepeat: (activityId, isAutoRepeat) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, activityId);
            if (result && result.type === 'activity') {
                const activity = result.item as Activity;
                activity.autoRepeat = isAutoRepeat;
                activity.lastEditedDate = new Date();
                if (result.parent && result.parent.type === 'subtask') {
                    (result.parent.item as Subtask).lastEditedDate = new Date();
                    const grandParentResult = findItemInDraft(draft, result.parent.item.parentId);
                    if (grandParentResult && grandParentResult.type === 'task') {
                        (grandParentResult.item as Task).lastEditedDate = new Date();
                    }
                }
            } else {
                console.error(`toggleActivityAutoRepeat: Activity ${activityId} not found.`);
            }
        })),
        updateActivitySchedule: (activityId, schedule) => set(produce((draft: TaskStore) => {
             const result = findItemInDraft(draft, activityId);
             if (result && result.type === 'activity') {
                 const activity = result.item as Activity;
                 activity.schedule = schedule;
                 activity.lastEditedDate = new Date();
                  if (result.parent && result.parent.type === 'subtask') {
                    (result.parent.item as Subtask).lastEditedDate = new Date();
                     const grandParentResult = findItemInDraft(draft, result.parent.item.parentId);
                    if (grandParentResult && grandParentResult.type === 'task') {
                        (grandParentResult.item as Task).lastEditedDate = new Date();
                    }
                }
             }
        })),
        updateActivityReminder: (activityId, reminder) => set(produce((draft: TaskStore) => {
             const result = findItemInDraft(draft, activityId);
             if (result && result.type === 'activity') {
                 const activity = result.item as Activity;
                 activity.reminder = reminder;
                 activity.lastEditedDate = new Date();
                 if (result.parent && result.parent.type === 'subtask') {
                    (result.parent.item as Subtask).lastEditedDate = new Date();
                     const grandParentResult = findItemInDraft(draft, result.parent.item.parentId);
                    if (grandParentResult && grandParentResult.type === 'task') {
                        (grandParentResult.item as Task).lastEditedDate = new Date();
                    }
                }
             }
        })),
         // Phase 1: Subtask Schedule/Reminder Actions
        toggleSubtaskAutoRepeat: (subtaskId, isAutoRepeat) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, subtaskId);
            if (result && result.type === 'subtask') {
                const subtask = result.item as Subtask;
                subtask.autoRepeat = isAutoRepeat;
                subtask.lastEditedDate = new Date();
                if (result.parent && result.parent.type === 'task') {
                    (result.parent.item as Task).lastEditedDate = new Date();
                }
                 // Propagate autoRepeat to child activities if parent subtask enables it
                if (isAutoRepeat && subtask.activities) {
                    subtask.activities.forEach(activity => {
                        activity.autoRepeat = true; // Enable auto-repeat for child activities
                        activity.schedule = { ...subtask.schedule }; // Inherit schedule
                        activity.reminder = { ...subtask.reminder }; // Inherit reminder
                        activity.lastEditedDate = new Date();
                    });
                }
            }
        })),
        updateSubtaskSchedule: (subtaskId, schedule) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, subtaskId);
            if (result && result.type === 'subtask') {
                const subtask = result.item as Subtask;
                subtask.schedule = schedule;
                subtask.lastEditedDate = new Date();
                if (result.parent && result.parent.type === 'task') {
                    (result.parent.item as Task).lastEditedDate = new Date();
                }
                if (subtask.autoRepeat && subtask.activities) {
                    subtask.activities.forEach(activity => {
                        activity.schedule = { ...schedule };
                        activity.lastEditedDate = new Date();
                    });
                }
            }
        })),
        updateSubtaskReminder: (subtaskId, reminder) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, subtaskId);
            if (result && result.type === 'subtask') {
                const subtask = result.item as Subtask;
                subtask.reminder = reminder;
                subtask.lastEditedDate = new Date();
                 if (result.parent && result.parent.type === 'task') {
                    (result.parent.item as Task).lastEditedDate = new Date();
                }
                 if (subtask.autoRepeat && subtask.activities) {
                    subtask.activities.forEach(activity => {
                        activity.reminder = { ...reminder };
                        activity.lastEditedDate = new Date();
                    });
                }
            }
        })),
        // Phase 1: Task Schedule/Reminder Actions
        toggleTaskAutoRepeat: (taskId, isAutoRepeat) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, taskId);
            if (result && result.type === 'task') {
                const task = result.item as Task;
                task.autoRepeat = isAutoRepeat;
                task.lastEditedDate = new Date();
                 // Propagate autoRepeat to child subtasks if parent task enables it
                if (isAutoRepeat && task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        subtask.autoRepeat = true;
                        subtask.schedule = { ...task.schedule };
                        subtask.reminder = { ...task.reminder };
                        subtask.lastEditedDate = new Date();
                        if (subtask.activities) {
                            subtask.activities.forEach(activity => {
                                activity.autoRepeat = true;
                                activity.schedule = { ...task.schedule };
                                activity.reminder = { ...task.reminder };
                                activity.lastEditedDate = new Date();
                            });
                        }
                    });
                }
            }
        })),
        updateTaskSchedule: (taskId, schedule) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, taskId);
            if (result && result.type === 'task') {
                const task = result.item as Task;
                task.schedule = schedule;
                task.lastEditedDate = new Date();
                if (task.autoRepeat && task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        subtask.schedule = { ...schedule };
                        subtask.lastEditedDate = new Date();
                        if (subtask.activities) {
                            subtask.activities.forEach(activity => {
                                activity.schedule = { ...schedule };
                                activity.lastEditedDate = new Date();
                            });
                        }
                    });
                }
            }
        })),
        updateTaskReminder: (taskId, reminder) => set(produce((draft: TaskStore) => {
            const result = findItemInDraft(draft, taskId);
            if (result && result.type === 'task') {
                const task = result.item as Task;
                task.reminder = reminder;
                task.lastEditedDate = new Date();
                 if (task.autoRepeat && task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        subtask.reminder = { ...reminder };
                        subtask.lastEditedDate = new Date();
                        if (subtask.activities) {
                            subtask.activities.forEach(activity => {
                                activity.reminder = { ...reminder };
                                activity.lastEditedDate = new Date();
                            });
                        }
                    });
                }
            }
        })),


    } // End of store object
});

export default useTaskStore;

