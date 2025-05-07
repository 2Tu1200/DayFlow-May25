// src/lib/store-utils.ts
import type { TaskList, Task, Subtask, Activity, DescriptionHistoryEntry } from '@/lib/types';

export const findItemInDraft = (
  draft: { taskLists: TaskList[] }, // More generic draft type
  id: string
): { type: 'task' | 'subtask' | 'activity' | 'taskList'; item: Task | Subtask | Activity | TaskList; parent?: { type: 'task' | 'subtask' | 'taskList'; item: Task | Subtask | TaskList } } | undefined => {
    for (const list of draft.taskLists) {
        if (list.id === id) return { type: 'taskList', item: list };
        for (const task of list.tasks) {
            if (task.id === id) return { type: 'task', item: task, parent: { type: 'taskList', item: list } };
            if (task.subtasks) {
                for (const subtask of task.subtasks) {
                    if (subtask.id === id) return { type: 'subtask', item: subtask, parent: { type: 'task', item: task } };
                    if (subtask.activities) {
                        for (const activity of subtask.activities) {
                            if (activity.id === id) return { type: 'activity', item: activity, parent: { type: 'subtask', item: subtask } };
                        }
                    }
                }
            }
        }
    }
    return undefined;
};

export const findItemRecursive = (
  id: string,
  items: (TaskList | Task | Subtask | Activity)[],
  parentInfo?: { type: 'task' | 'subtask' | 'taskList'; item: Task | Subtask | TaskList }
): { type: 'task' | 'subtask' | 'activity' | 'taskList'; item: Task | Subtask | Activity | TaskList; parent?: { type: 'task' | 'subtask' | 'taskList'; item: Task | Subtask | TaskList } } | undefined => {
  for (const item of items) {
    let currentItemType: 'taskList' | 'task' | 'subtask' | 'activity';
    if ('tasks' in item) currentItemType = 'taskList';
    else if ('subtasks' in item) currentItemType = 'task';
    else if ('activities' in item) currentItemType = 'subtask';
    else currentItemType = 'activity';

    if (item.id === id) {
      return { type: currentItemType, item: item as Task | Subtask | Activity | TaskList, parent: parentInfo };
    }

    let found;
    let nextParentInfo: { type: 'task' | 'subtask' | 'taskList'; item: Task | Subtask | TaskList } | undefined;

    if ('tasks' in item && item.tasks) {
        nextParentInfo = { type: 'taskList', item: item as TaskList };
        found = findItemRecursive(id, item.tasks, nextParentInfo);
    } else if ('subtasks' in item && item.subtasks) {
        nextParentInfo = { type: 'task', item: item as Task };
        found = findItemRecursive(id, item.subtasks, nextParentInfo);
    } else if ('activities' in item && item.activities) {
        nextParentInfo = { type: 'subtask', item: item as Subtask };
        found = findItemRecursive(id, item.activities, nextParentInfo);
    }

    if (found) return found;
  }
  return undefined;
};

export const findParentListRecursive = (itemId: string, lists: TaskList[]): TaskList | undefined => {
    for (const list of lists) {
        if (list.id === itemId) return list;
        if (list.tasks.some(task => task.id === itemId)) return list;
        for (const task of list.tasks) {
             if (!task.subtasks) continue;
            if (task.subtasks.some(subtask => subtask.id === itemId)) return list;
            for (const subtask of task.subtasks) {
                 if (!subtask.activities) continue;
                if (subtask.activities.some(activity => activity.id === itemId)) return list;
            }
        }
    }
    return undefined;
};

export const getAllItemsRecursive = (lists: TaskList[]): (Task | Subtask | Activity)[] => {
    const allItems: (Task | Subtask | Activity)[] = [];
    lists.forEach(list => {
        list.tasks.forEach(task => {
            allItems.push(task);
             if (!task.subtasks) return;
            task.subtasks.forEach(subtask => {
                allItems.push(subtask);
                 if (!subtask.activities) return;
                subtask.activities.forEach(activity => {
                    allItems.push(activity);
                });
            });
        });
    });
    return allItems;
};

export const addHistoryEntry = (item: Task | Subtask | Activity, timestamp: Date, content: string) => {
    if (!item.descriptionHistory) item.descriptionHistory = [];
    const trimmedContent = content.trim();
    if (trimmedContent) {
      item.descriptionHistory.push({ timestamp, content: trimmedContent });
    }
};
