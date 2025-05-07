// src/lib/export-utils.ts
import type { TaskList, Task, Subtask, Activity, Attachment, DescriptionHistoryEntry } from '@/lib/types';
import { format } from 'date-fns';

// --- Helper Functions ---

function escapeCsvCell(cellData: string | undefined | null): string {
  if (cellData == null) return '';
  const stringData = String(cellData);
  // If the string contains a comma, newline, or double quote, enclose it in double quotes
  if (stringData.includes(',') || stringData.includes('\n') || stringData.includes('"')) {
    // Escape existing double quotes by doubling them
    return `"${stringData.replace(/"/g, '""')}"`;
  }
  return stringData;
}

function formatAttachmentsForExport(attachments: Attachment[] | undefined): string {
    if (!attachments || attachments.length === 0) return '';
    return attachments.map(att => `${att.name} (${att.type === 'link' ? att.url : att.fileType || 'file'})`).join('; ');
}

function formatHistoryForExport(history: DescriptionHistoryEntry[] | undefined): string {
    if (!history || history.length === 0) return '';
    // Return a simplified history summary for CSV/Text
    return history.map(entry => `[${format(entry.timestamp, 'yyyy-MM-dd HH:mm')}] ${entry.content.substring(0, 50)}...`).join(' | ');
}

function formatDateForExport(date: Date | undefined | null): string {
    return date ? format(date, "yyyy-MM-dd'T'HH:mm:ssXXX") : ''; // ISO 8601 format
}

// --- Export Functions ---

export function exportToCSV(taskLists: TaskList[]): string {
  const rows: string[][] = [];
  // Header Row
  rows.push([
    'ItemID',
    'ParentID',
    'ItemType', // Task, Subtask, Activity
    'ListName',
    'TaskName',
    'SubtaskName',
    'ActivityName',
    'Description',
    'Priority',
    'Status',
    'CreationDate',
    'ExpectedCompletionDate',
    'ActualCompletionDate',
    'LastEditedDate',
    'Order',
    'SerialCompletionMandatory', // For Task/Subtask
    'SequenceMandatory', // For Task/Subtask
    'Dependencies', // Comma-separated IDs
    'Attachments', // Simple list
    // 'HistorySummary', // Maybe too verbose for CSV
  ]);

  taskLists.forEach(list => {
    list.tasks.forEach(task => {
      // Task Row
      rows.push([
        escapeCsvCell(task.id),
        escapeCsvCell(task.listId),
        'Task',
        escapeCsvCell(list.name),
        escapeCsvCell(task.name),
        '', // SubtaskName
        '', // ActivityName
        escapeCsvCell(task.description),
        escapeCsvCell(task.priority),
        escapeCsvCell(task.status),
        escapeCsvCell(formatDateForExport(task.creationDate)),
        escapeCsvCell(formatDateForExport(task.expectedCompletionDate)),
        escapeCsvCell(formatDateForExport(task.actualCompletionDate)),
        escapeCsvCell(formatDateForExport(task.lastEditedDate)),
        escapeCsvCell(String(task.order)),
        escapeCsvCell(String(task.serialCompletionMandatory)),
        escapeCsvCell(String(task.sequenceMandatory)),
        escapeCsvCell(task.dependencies?.join(', ')),
        escapeCsvCell(formatAttachmentsForExport(task.attachments)),
        // escapeCsvCell(formatHistoryForExport(task.descriptionHistory)),
      ]);

      task.subtasks?.forEach(subtask => {
        // Subtask Row
        rows.push([
          escapeCsvCell(subtask.id),
          escapeCsvCell(subtask.parentId),
          'Subtask',
          escapeCsvCell(list.name),
          escapeCsvCell(task.name),
          escapeCsvCell(subtask.name),
          '', // ActivityName
          escapeCsvCell(subtask.description),
          escapeCsvCell(subtask.priority),
          escapeCsvCell(subtask.status),
          escapeCsvCell(formatDateForExport(subtask.creationDate)),
          escapeCsvCell(formatDateForExport(subtask.expectedCompletionDate)),
          escapeCsvCell(formatDateForExport(subtask.actualCompletionDate)),
          escapeCsvCell(formatDateForExport(subtask.lastEditedDate)),
          escapeCsvCell(String(subtask.order)),
          escapeCsvCell(String(subtask.serialCompletionMandatory)),
          escapeCsvCell(String(subtask.sequenceMandatory)),
          escapeCsvCell(subtask.dependencies?.join(', ')),
          escapeCsvCell(formatAttachmentsForExport(subtask.attachments)),
          // escapeCsvCell(formatHistoryForExport(subtask.descriptionHistory)),
        ]);

        subtask.activities?.forEach(activity => {
          // Activity Row
          rows.push([
            escapeCsvCell(activity.id),
            escapeCsvCell(activity.parentId),
            'Activity',
            escapeCsvCell(list.name),
            escapeCsvCell(task.name),
            escapeCsvCell(subtask.name),
            escapeCsvCell(activity.name),
            escapeCsvCell(activity.description),
            escapeCsvCell(activity.priority),
            escapeCsvCell(activity.status),
            escapeCsvCell(formatDateForExport(activity.creationDate)),
            escapeCsvCell(formatDateForExport(activity.expectedCompletionDate)),
            escapeCsvCell(formatDateForExport(activity.actualCompletionDate)),
            escapeCsvCell(formatDateForExport(activity.lastEditedDate)),
            escapeCsvCell(String(activity.order)),
            '', // SerialCompletionMandatory (N/A for Activity)
            '', // SequenceMandatory (N/A for Activity)
            '', // Dependencies (N/A for Activity)
             escapeCsvCell(formatAttachmentsForExport(activity.attachments)),
            // escapeCsvCell(formatHistoryForExport(activity.descriptionHistory)),
          ]);
        });
      });
    });
  });

  return rows.map(row => row.join(',')).join('\n');
}


export function exportToJSON(taskLists: TaskList[]): string {
  // Use a replacer function to handle Date objects correctly
  const replacer = (key: string, value: any) => {
    // If the value is a Date object, convert it to ISO string
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  };
  return JSON.stringify(taskLists, replacer, 2); // Pretty print with 2 spaces
}


export function exportToPlainText(taskLists: TaskList[]): string {
  let text = `DayFlow Export - ${format(new Date(), 'PPP p')}\n\n`;

  taskLists.forEach((list, listIndex) => {
    text += `==============================\n`;
    text += `LIST: ${list.name} (ID: ${list.id})\n`;
    text += `==============================\n\n`;

    if (list.tasks.length === 0) {
        text += "(No tasks in this list)\n\n";
        return; // Skip to next list
    }


    list.tasks.sort((a,b) => a.order - b.order).forEach((task, taskIndex) => {
      text += `TASK ${taskIndex + 1}: ${task.name} (ID: ${task.id})\n`;
      text += `  Status: ${task.status} | Priority: ${task.priority}\n`;
      text += `  Created: ${formatDateForExport(task.creationDate)} | Expected: ${formatDateForExport(task.expectedCompletionDate)}${task.actualCompletionDate ? ' | Completed: ' + formatDateForExport(task.actualCompletionDate) : ''}\n`;
      if (task.description) text += `  Description: ${task.description}\n`;
      if (task.dependencies && task.dependencies.length > 0) text += `  Dependencies: ${task.dependencies.join(', ')}\n`;
      if (task.attachments && task.attachments.length > 0) text += `  Attachments: ${formatAttachmentsForExport(task.attachments)}\n`;
      text += `  Settings: SerialSubtasks=${task.serialCompletionMandatory}, LockSubtaskOrder=${task.sequenceMandatory}\n`;
      text += `  Last Edited: ${formatDateForExport(task.lastEditedDate)}\n`;

      if (task.descriptionHistory && task.descriptionHistory.length > 0) {
        text += `  --- History ---\n`;
        task.descriptionHistory.forEach(entry => {
            text += `    [${format(entry.timestamp, 'yyyy-MM-dd HH:mm')}] ${entry.content}\n`;
        });
        text += `  ---------------\n`;
      }

      if (task.subtasks && task.subtasks.length > 0) {
         text += `  --- Subtasks ---\n`;
         task.subtasks.sort((a,b) => a.order - b.order).forEach((subtask, subtaskIndex) => {
          text += `    SUBTASK ${taskIndex + 1}.${subtaskIndex + 1}: ${subtask.name} (ID: ${subtask.id})\n`;
          text += `      Status: ${subtask.status} | Priority: ${subtask.priority}\n`;
          text += `      Created: ${formatDateForExport(subtask.creationDate)} | Expected: ${formatDateForExport(subtask.expectedCompletionDate)}${subtask.actualCompletionDate ? ' | Completed: ' + formatDateForExport(subtask.actualCompletionDate) : ''}\n`;
          if (subtask.description) text += `      Description: ${subtask.description}\n`;
          if (subtask.dependencies && subtask.dependencies.length > 0) text += `      Dependencies: ${subtask.dependencies.join(', ')}\n`;
          if (subtask.attachments && subtask.attachments.length > 0) text += `      Attachments: ${formatAttachmentsForExport(subtask.attachments)}\n`;
          text += `      Settings: SerialActivities=${subtask.serialCompletionMandatory}, LockActivityOrder=${subtask.sequenceMandatory}\n`;
          text += `      Last Edited: ${formatDateForExport(subtask.lastEditedDate)}\n`;

            if (subtask.descriptionHistory && subtask.descriptionHistory.length > 0) {
                text += `      --- History ---\n`;
                subtask.descriptionHistory.forEach(entry => {
                    text += `        [${format(entry.timestamp, 'yyyy-MM-dd HH:mm')}] ${entry.content}\n`;
                });
                text += `      ---------------\n`;
            }


          if (subtask.activities && subtask.activities.length > 0) {
            text += `      --- Activities ---\n`;
             subtask.activities.sort((a,b) => a.order - b.order).forEach((activity, activityIndex) => {
              text += `        ACTIVITY ${taskIndex + 1}.${subtaskIndex + 1}.${activityIndex + 1}: ${activity.name} (ID: ${activity.id})\n`;
              text += `          Status: ${activity.status} | Priority: ${activity.priority}\n`;
              text += `          Created: ${formatDateForExport(activity.creationDate)} | Expected: ${formatDateForExport(activity.expectedCompletionDate)}${activity.actualCompletionDate ? ' | Completed: ' + formatDateForExport(activity.actualCompletionDate) : ''}\n`;
              if (activity.description) text += `          Description: ${activity.description}\n`;
               if (activity.attachments && activity.attachments.length > 0) text += `          Attachments: ${formatAttachmentsForExport(activity.attachments)}\n`;
               text += `          Last Edited: ${formatDateForExport(activity.lastEditedDate)}\n`;

                 if (activity.descriptionHistory && activity.descriptionHistory.length > 0) {
                    text += `          --- History ---\n`;
                    activity.descriptionHistory.forEach(entry => {
                        text += `            [${format(entry.timestamp, 'yyyy-MM-dd HH:mm')}] ${entry.content}\n`;
                    });
                    text += `          ---------------\n`;
                }

              text += '\n';
            });
            text += `      ------------------\n`;
          } else {
             text += `      (No activities)\n`;
          }
          text += '\n';
        });
        text += `  ----------------\n`;
      } else {
         text += `  (No subtasks)\n`;
      }
      text += '\n'; // Add space between tasks
    });

    text += '\n'; // Add space between lists
  });

  return text;
}

// --- Download Trigger ---

export function triggerDownload(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
