// src/lib/types.ts

export type Priority = 'high' | 'medium' | 'low';
export type Status = 'todo' | 'started' | 'inprogress' | 'done';

export interface DescriptionHistoryEntry {
    timestamp: Date;
    content: string;
}

// Define the structure for an attachment
export interface Attachment {
    id: string;
    type: 'link' | 'file'; // Type of attachment
    name: string; // Display name (e.g., filename or link title)
    url?: string; // URL for links
    dataUri?: string; // Data URI for files (base64 encoded)
    fileType?: string; // Mime type for files (e.g., 'image/png', 'application/pdf')
    timestamp: Date; // When the attachment was added
}


export interface Activity {
  id: string;
  parentId: string; // ID of the parent Subtask
  name: string;
  description?: string;
  creationDate: Date; // Renamed from startDate
  expectedCompletionDate: Date;
  actualCompletionDate?: Date;
  lastEditedDate: Date; // Added
  status: Status; // Updated type
  priority: Priority;
  order: number; // For sorting within the parent Subtask
  descriptionHistory: DescriptionHistoryEntry[]; // Added
  attachments: Attachment[]; // Added attachments field
}

export interface Subtask {
  id: string;
  parentId: string; // ID of the parent Task
  name: string;
  description?: string;
  creationDate: Date; // Renamed from startDate
  expectedCompletionDate: Date;
  actualCompletionDate?: Date;
  lastEditedDate: Date; // Added
  status: Status; // Updated type
  priority: Priority;
  order: number; // For sorting within the parent Task
  serialCompletionMandatory: boolean; // Applies to its Activities (completion order)
  sequenceMandatory: boolean; // Applies to its Activities (reordering lock)
  activities: Activity[];
  dependencies: string[]; // IDs of other Subtasks or Tasks this depends on
  descriptionHistory: DescriptionHistoryEntry[]; // Added
  attachments: Attachment[]; // Added attachments field
}

export interface Task {
  id: string;
  listId: string; // ID of the TaskList it belongs to
  name: string;
  description?: string;
  creationDate: Date; // Renamed from startDate
  expectedCompletionDate: Date;
  actualCompletionDate?: Date;
  lastEditedDate: Date; // Added
  status: Status; // Updated type
  priority: Priority;
  order: number; // For sorting within the TaskList
  serialCompletionMandatory: boolean; // Applies to its Subtasks (completion order)
  sequenceMandatory: boolean; // Applies to its Subtasks (reordering lock)
  subtasks: Subtask[];
  dependencies: string[]; // IDs of other Tasks this depends on
  descriptionHistory: DescriptionHistoryEntry[]; // Added
  attachments: Attachment[]; // Added attachments field
}

export interface TaskList {
  id: string;
  name: string;
  tasks: Task[];
}

// Type for the AI scheduling input, aligning with genkit flow
// Note: AI Flow doesn't need creationDate, lastEditedDate, or history. It cares about deadlines.
export interface SuggestTaskScheduleInput {
  tasks: {
    id: string;
    name: string;
    priority: Priority;
    deadline?: string; // ISO 8601 format (from expectedCompletionDate)
    dependencies: string[];
    estimatedTime: number; // In hours
    description?: string;
    subtasks?: {
      id: string;
      name: string;
      priority: Priority;
      deadline?: string; // ISO 8601 format (from expectedCompletionDate)
      dependencies: string[];
      estimatedTime: number; // In hours
      description?: string;
      // Activities can be modeled similarly if the AI needs that level of detail
    }[];
  }[];
  userContext?: string;
}

// Type for the AI scheduling output, aligning with genkit flow
export interface SuggestTaskScheduleOutput {
   schedule: {
    itemId: string; // Use itemId instead of taskId for generality
    creationDate: string; // Use creationDate (maps to startTime)
    expectedCompletionDate: string; // Use expectedCompletionDate (maps to endTime)
  }[];
}
