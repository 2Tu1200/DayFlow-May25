// src/ai/flows/suggest-task-schedule.ts
'use server';
/**
 * @fileOverview This file defines a Genkit flow for suggesting optimal task schedules based on priority, deadlines, and dependencies.
 *
 * - suggestTaskSchedule - A function that uses AI to suggest the optimal task scheduling.
 * - SuggestTaskScheduleInput - The input type for the suggestTaskSchedule function.
 * - SuggestTaskScheduleOutput - The return type for the suggestTaskSchedule function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import type { Priority } from '@/lib/types'; // Import Priority type if not already imported


// Schema for AI Subtasks - Simplified for scheduling focus
const SubtaskSchemaForAI = z.object({
    id: z.string().describe('Unique identifier for the subtask.'),
    name: z.string().describe('Name of the subtask.'),
    priority: z.enum(['high', 'medium', 'low']).describe('Priority of the subtask.'),
    // Use expectedCompletionDate as the 'deadline' for the AI
    deadline: z.string().datetime().optional().describe('Expected completion date for the subtask (ISO 8601 format).'),
    dependencies: z.array(z.string()).optional().describe('List of task/subtask IDs that this subtask depends on.'),
    estimatedTime: z.number().describe('Estimated time to complete the subtask in hours.'),
    description: z.string().optional().describe('A description of the subtask.'),
});

// Schema for AI Tasks - Simplified for scheduling focus
const TaskSchemaForAI = z.object({
    id: z.string().describe('Unique identifier for the task.'),
    name: z.string().describe('Name of the task.'),
    priority: z.enum(['high', 'medium', 'low']).describe('Priority of the task.'),
    // Use expectedCompletionDate as the 'deadline' for the AI
    deadline: z.string().datetime().optional().describe('Expected completion date for the task (ISO 8601 format).'),
    dependencies: z.array(z.string()).optional().describe('List of task IDs that this task depends on.'),
    estimatedTime: z.number().describe('Estimated total time to complete the task and its subtasks in hours.'),
    description: z.string().optional().describe('A description of the task.'),
    subtasks: z.array(SubtaskSchemaForAI).optional().describe('Subtasks for the task.'),
});


const SuggestTaskScheduleInputSchema = z.object({
  tasks: z.array(TaskSchemaForAI).describe('List of tasks to schedule.'),
  userContext: z.string().optional().describe('Any relevant user context to improve scheduling (e.g., working hours, preferred break times, current date).'),
});
export type SuggestTaskScheduleInput = z.infer<typeof SuggestTaskScheduleInputSchema>;

// Output schema maps AI's suggestion back to our data model terminology
const SuggestTaskScheduleOutputSchema = z.object({
  schedule: z.array(
    z.object({
      itemId: z.string().describe('ID of the task or subtask being scheduled.'), // Use itemId to map back easily
      // Map AI's startTime to creationDate (or a suggested start if needed)
      creationDate: z.string().datetime().describe('Suggested start time/creation date for the item (ISO 8601 format).'),
      // Map AI's endTime to expectedCompletionDate
      expectedCompletionDate: z.string().datetime().describe('Suggested expected completion date for the item (ISO 8601 format).'),
    })
  ).describe('Suggested schedule for the tasks and their subtasks. The schedule should only include items that need active work (tasks or subtasks). Activities within subtasks should be considered part of the subtask duration.'),
});
export type SuggestTaskScheduleOutput = z.infer<typeof SuggestTaskScheduleOutputSchema>;

export async function suggestTaskSchedule(input: SuggestTaskScheduleInput): Promise<SuggestTaskScheduleOutput> {
  if (!input.tasks || input.tasks.length === 0) {
    return { schedule: [] };
  }
  return suggestTaskScheduleFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestTaskSchedulePrompt',
  input: {
    schema: SuggestTaskScheduleInputSchema,
  },
  output: {
    schema: SuggestTaskScheduleOutputSchema, // Use the updated output schema
  },
  prompt: `You are an AI assistant specialized in creating efficient task schedules.

  Analyze the provided list of tasks and their subtasks. Consider the following factors for each item:
  - Priority: High priority tasks should ideally be scheduled sooner.
  - Deadlines (Expected Completion Dates): Ensure the schedule respects the specified expected completion dates.
  - Dependencies: A task or subtask cannot start until all its dependencies are completed.
  - Estimated Time: Allocate sufficient time for each task and subtask based on the estimates. Subtask estimates include their activities.
  - Hierarchy: Schedule subtasks within the timeframe of their parent task.

  Tasks:
  {{#each tasks}}
  - Task ID: {{this.id}}
    Name: "{{this.name}}"
    Priority: {{this.priority}}
    {{#if this.deadline}}Expected Completion: {{this.deadline}}{{/if}}
    {{#if this.dependencies}}Dependencies: {{#join this.dependencies ", "}}{{/join}}{{/if}}
    Estimated Time (Total): {{this.estimatedTime}} hours
    {{#if this.description}}Description: {{this.description}}{{/if}}
    {{#if this.subtasks}}
    Subtasks:
      {{#each this.subtasks}}
      - Subtask ID: {{this.id}}
        Name: "{{this.name}}"
        Priority: {{this.priority}}
        {{#if this.deadline}}Expected Completion: {{this.deadline}}{{/if}}
        {{#if this.dependencies}}Dependencies: {{#join this.dependencies ", "}}{{/join}}{{/if}}
        Estimated Time: {{this.estimatedTime}} hours
        {{#if this.description}}Description: {{this.description}}{{/if}}
      {{/each}}
    {{else}}
      (No subtasks)
    {{/if}}
  --------------------
  {{/each}}

  {{#if userContext}}
  User Context/Preferences: {{userContext}}
  {{/if}}

  Generate an optimal schedule that maximizes productivity, respects all constraints (dependencies, deadlines), and allocates time realistically.
  The schedule should list specific start (creationDate) and end (expectedCompletionDate) times (in ISO 8601 format) for each task *and* each subtask that requires effort. Do not schedule the activities individually; their time is included in the subtask's estimated time.

  Return your answer ONLY as a JSON object conforming exactly to the SuggestTaskScheduleOutput schema (using itemId, creationDate, expectedCompletionDate). Ensure all dates are valid ISO 8601 date-time strings.
  `,
});

const suggestTaskScheduleFlow = ai.defineFlow<
  typeof SuggestTaskScheduleInputSchema,
  typeof SuggestTaskScheduleOutputSchema
>(
  {
    name: 'suggestTaskScheduleFlow',
    inputSchema: SuggestTaskScheduleInputSchema,
    outputSchema: SuggestTaskScheduleOutputSchema,
  },
  async input => {

    const {output} = await prompt(input);

    // Basic validation of the output
    if (!output || !Array.isArray(output.schedule)) {
        throw new Error("AI did not return a valid schedule array.");
    }
    output.schedule.forEach(item => {
        if (new Date(item.expectedCompletionDate) < new Date(item.creationDate)) {
            console.warn(`AI suggested invalid dates for ${item.itemId}: completion before creation. Attempting to adjust.`);
            // Simple adjustment: set completion = creation. More complex logic could be added.
            item.expectedCompletionDate = item.creationDate;
        }
    });


    return output!;
  }
);
