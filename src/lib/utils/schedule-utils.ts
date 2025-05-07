// src/lib/utils/schedule-utils.ts
import type { TaskList, Task, Subtask, Activity, Schedule, Reminder } from '@/lib/types';
import { isWithinInterval, add, isBefore, isEqual, parseISO } from 'date-fns'; // Add parseISO

// Function to find an item and its path from the root (lists)
export const getItemPath = (itemId: string, taskLists: TaskList[]): { item: TaskList | Task | Subtask | Activity, type: string }[] => {
    for (const list of taskLists) {
        if (list.id === itemId) return [{ item: list, type: 'taskList' }];
        if (!list.tasks) continue; // Add a check for undefined tasks
        for (const task of list.tasks) {
            if (task.id === itemId) return [{ item: list, type: 'taskList' }, { item: task, type: 'task' }];
            if (!task.subtasks) continue; // Add a check for undefined subtasks
            for (const subtask of list.subtasks) {
                if (subtask.id === itemId) return [{ item: list, type: 'taskList' }, { item: task, type: 'task' }, { item: subtask, type: 'subtask' }];
                if (!subtask.activities) continue; // Add a check for undefined activities
                for (const activity of subtask.activities) {
                    if (activity.id === itemId) return [{ item: list, type: 'taskList' }, { item: task, type: 'task' }, { item: subtask, type: 'subtask' }, { item: activity, type: 'activity' }];
                }
            }
        }
    }
    return []; // Item not found
};


// Function to determine the effective schedule for an item (considers inheritance)
export const getActiveScheduleRule = (itemId: string, taskLists: TaskList[]): Schedule | undefined => {
    const path = getItemPath(itemId, taskLists);
    if (path.length === 0) return undefined;

    for (let i = path.length - 1; i >= 0; i--) {
        const current = path[i].item as Task | Subtask | Activity; // TaskList doesn't have schedule
        if (current.schedule && current.schedule.recurrenceRule) {
            // Validate if schedule is within parent's date constraints if applicable
            if (i > 0) { // Has a parent in the path
                const parent = path[i-1].item as Task | Subtask | TaskList;
                // For now, we assume schedule is valid if present. More complex validation can be added.
                // E.g., check if specificTimes in schedule are within parent's creation/expected completion
            }
            return current.schedule;
        }
    }
    return undefined; // No active schedule found in the hierarchy
};

// Function to check if an item is currently "active" based on its schedule
export const isItemActive = (itemId: string, taskLists: TaskList[]): boolean => {
    const schedule = getActiveScheduleRule(itemId, taskLists);
    if (!schedule || !schedule.recurrenceRule) return true; // No schedule means always active for editing (or rely on parent's lock)

    const now = new Date();
    const itemPath = getItemPath(itemId, taskLists);
    if (itemPath.length === 0) return false; // Should not happen if schedule was found
    const item = itemPath[itemPath.length -1].item as Task | Subtask | Activity;


    // Simple check for "daily" - more robust parsing needed for RRule
    if (schedule.recurrenceRule.toLowerCase() === 'daily') {
        if (schedule.specificTimes && schedule.specificTimes.length > 0) {
            // Check if 'now' falls within any of the specific time slots for today
            // This requires parsing specificTimes (e.g., "10:00-12:00") and comparing
            // This is a simplified example and needs robust parsing
            return schedule.specificTimes.some(slot => {
                try {
                    const [startStr, endStr] = slot.split('-');
                    if (!startStr || !endStr) return false;

                    const [startHour, startMinute] = startStr.split(':').map(Number);
                    const [endHour, endMinute] = endStr.split(':').map(Number);

                    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMinute);
                    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMinute);
                    
                    return isWithinInterval(now, { start: startDate, end: endDate });
                } catch (e) {
                    console.error("Error parsing specific time slot:", slot, e);
                    return false;
                }
            });
        }
        return true; // Daily with no specific times means active all day
    }

    // Placeholder for more complex RRule parsing (e.g., using a library like rrule.js)
    // For now, if not "daily", assume not active unless more rules are added.
    return false;
};

// Helper to check if an item's date fields should be locked
export const areDateFieldsLocked = (itemId: string, taskLists: TaskList[]): boolean => {
    const path = getItemPath(itemId, taskLists);
    if (path.length <= 1) return false; // Top-level items (tasks) are not locked by parents initially

    // Check if any parent in the hierarchy has autoRepeat enabled
    for (let i = 0; i < path.length - 1; i++) { // Iterate up to the direct parent
        const parent = path[i].item as Task | Subtask | Activity; // Activity can't be a parent in this context
        if ('autoRepeat' in parent && parent.autoRepeat) {
            return true;
        }
    }
    return false;
};
