// src/app/history/page.tsx
'use client';

import React from 'react';
import useTaskStore from '@/hooks/use-task-store';
import type { Task, Subtask, Activity, DescriptionHistoryEntry, Status, Priority } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, Edit2, Activity as ActivityIconLucide } from 'lucide-react'; // Added Edit2 and Activity icons
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, TooltipProps } from 'recharts'; // Import PieChart components
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'; // Ensure TooltipProvider is imported

// Helper to determine color based on priority
const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
        case 'high': return 'hsl(var(--destructive))';
        case 'medium': return 'hsl(var(--primary))';
        case 'low': return 'hsl(var(--success))';
        default: return 'hsl(var(--muted-foreground))';
    }
};

// Helper to determine color based on status
const getStatusColor = (status: Status) => {
    switch (status) {
        case 'todo': return 'hsl(var(--muted-foreground))'; // Gray for todo
        case 'started': return 'hsl(var(--started))'; // Yellow/Orange for started
        case 'inprogress': return 'hsl(var(--inprogress))'; // Blue for inprogress
        case 'done': return 'hsl(var(--success))'; // Green for done
        default: return 'hsl(var(--muted-foreground))';
    }
};

// --- Chart data processing logic ---

// Bar Chart data processing for HORIZONTAL chart with hierarchy attempt
const processBarChartData = (items: (Task | Subtask | Activity)[], state: ReturnType<typeof useTaskStore>) => {
    const processedData = items.map(item => {
        const creation = item.creationDate?.getTime() ?? Date.now();
        const expected = item.expectedCompletionDate?.getTime() ?? Date.now();
        const actual = item.actualCompletionDate?.getTime();

        const durationExpected = expected > creation ? (expected - creation) / (1000 * 60 * 60 * 24) : 0; // Duration in days
        let durationActual = 0;
        let delay = 0;

        if (actual && actual > creation) {
            durationActual = (actual - creation) / (1000 * 60 * 60 * 24);
            if (actual > expected) {
                delay = (actual - expected) / (1000 * 60 * 60 * 24);
            }
        } else if (!actual && new Date().getTime() > expected) {
             delay = (new Date().getTime() - expected) / (1000 * 60 * 60 * 24);
        }

        let hierarchicalName = item.name;
        let level = 0;
        let parentName = '';
        if ('listId' in item) { // Task
            const parentList = state.findParentList(item.id);
            parentName = parentList?.name || '';
            hierarchicalName = `${item.name}`; // No indent for tasks
            level = 0;
        } else if ('activities' in item) { // Subtask
             const parentTaskResult = state.findItem(item.parentId);
             parentName = parentTaskResult?.item.name || '';
             hierarchicalName = `↳ ${item.name}`; // Indent subtasks
             level = 1;
        } else if ('parentId' in item) { // Activity
             const parentSubtaskResult = state.findItem(item.parentId);
             const parentTaskResult = parentSubtaskResult ? state.findItem(parentSubtaskResult.item.parentId) : undefined;
             parentName = parentSubtaskResult?.item.name || '';
             hierarchicalName = `↳↳ ${item.name}`; // Double indent activities
             level = 2;
        }


        return {
            name: item.name, // Original name for tooltip
            hierarchicalName: hierarchicalName, // Name with indentation for Y-axis
            id: item.id,
            parentId: ('parentId' in item) ? item.parentId : ('listId' in item) ? item.listId : null,
            type: ('listId' in item) ? 'Task' : ('activities' in item) ? 'Subtask' : 'Activity',
            priority: item.priority,
            status: item.status,
            level: level, // Add level for potential sorting/grouping
            durationExpected: parseFloat(durationExpected.toFixed(1)),
            durationActual: parseFloat(durationActual.toFixed(1)),
            delay: parseFloat(delay.toFixed(1)),
            fill: getPriorityColor(item.priority),
        };
    });
    // Sort data hierarchically: first by parent, then by level, then by order/name
     processedData.sort((a, b) => {
        if (a.level !== b.level) {
            return a.level - b.level; // Sort by level first
        }
        // If same level, try to sort by parent (more complex logic needed for full hierarchy sort)
        // For simplicity, sort by name if level is same
        return a.name.localeCompare(b.name);
    });
    return processedData;
};

// Pie Chart data processing - Considers only CURRENT activities
const processPieChartData = (items: (Task | Subtask | Activity)[]) => {
    const statusCounts: Record<Status, number> = {
        todo: 0,
        started: 0,
        inprogress: 0,
        done: 0,
    };

    // Filter for activities only
    const activities = items.filter(item => !('listId' in item) && !('activities' in item)) as Activity[];

    activities.forEach(item => {
        statusCounts[item.status]++;
    });

    const pieData = Object.entries(statusCounts)
        .filter(([, count]) => count > 0) // Only include statuses with counts > 0
        .map(([status, count]) => ({
            name: status.charAt(0).toUpperCase() + status.slice(1), // Capitalize status name
            value: count,
            fill: getStatusColor(status as Status), // Get color based on status
        }));

    return pieData;
};

// Custom Tooltip for Recharts
const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload; // Assuming payload[0] exists and has the data

        // Determine if it's pie chart data or bar chart data based on properties
        if ('durationExpected' in data) { // Bar chart data (horizontal or vertical)
            return (
                <div className="bg-background border border-border p-2 rounded shadow-md text-xs">
                    <p className="font-bold">{`${data.name} (${data.type})`}</p> {/* Use original name */}
                     {payload.map((pld: any) => (
                         <p key={pld.dataKey} style={{ color: pld.fill || pld.stroke }}> {/* Use fill for bar, stroke might be needed for line */}
                             {`${pld.name}: ${pld.value}`} {pld.dataKey === 'durationExpected' || pld.dataKey === 'durationActual' || pld.dataKey === 'delay' ? ' days' : ''}
                         </p>
                     ))}
                     <p>Status: {data.status}</p>
                     <p>Priority: {data.priority}</p>
                </div>
            );
        } else { // Pie chart data
             return (
                 <div className="bg-background border border-border p-2 rounded shadow-md text-xs">
                     <p style={{ color: data.fill }} className="font-bold">{`${data.name}: ${data.value}`}</p>
                 </div>
             );
        }
    }
    return null;
};


export default function HistoryPage() {
    const taskStore = useTaskStore(); // Get the entire store instance once
    const router = useRouter();
    const allItems = taskStore.getAllItems(); // Get all items (tasks, subtasks, activities)

    // Filter items with description history
    const itemsWithHistory = allItems.filter(item => item.descriptionHistory && item.descriptionHistory.length > 0);

    // Prepare data for charts using only current items
    const barChartData = processBarChartData(allItems, taskStore); // Pass store for hierarchy lookup
    const pieChartData = processPieChartData(allItems); // Only uses activities

    const renderHistoryEntry = (entry: DescriptionHistoryEntry, index: number, item: Task | Subtask | Activity) => {
        const isStatusChange = entry.content.startsWith('[STATUS]');
        const isEdit = entry.content.startsWith('[EDIT]');
        const isScheduleChange = entry.content.startsWith('[SCHEDULE]');
        const isReminderChange = entry.content.startsWith('[REMINDER]');
        const isDueChange = entry.content.startsWith('[DUE]');
        const isSkipChange = entry.content.startsWith('[SKIP]');

        let displayContent = entry.content;
        let icon = <Edit2 size={12} className="inline mr-1 text-muted-foreground" />;
        let title = 'Edit';

        if (isStatusChange) {
            displayContent = entry.content.replace('[STATUS] ', '');
            icon = <ActivityIconLucide size={12} className="inline mr-1 text-primary" />;
            title = 'Status Change';
        } else if (isScheduleChange) {
            displayContent = entry.content.replace('[SCHEDULE] ', '');
            icon = <Clock size={12} className="inline mr-1 text-blue-500" />; // Example color
            title = 'Schedule Change';
        } else if (isReminderChange) {
            displayContent = entry.content.replace('[REMINDER] ', '');
            icon = <Clock size={12} className="inline mr-1 text-orange-500" />; // Example color
            title = 'Reminder Change';
        } else if (isDueChange) {
             displayContent = entry.content.replace('[DUE] ', '');
             icon = <AlertTriangle size={12} className="inline mr-1 text-destructive" />; // Example color
             title = 'Marked Due';
        } else if (isSkipChange) {
             displayContent = entry.content.replace('[SKIP] ', '');
             icon = <ArrowLeft size={12} className="inline mr-1 text-yellow-600" />; // Example color (using ArrowLeft as placeholder)
             title = 'Marked Skipped';
        } else if (isEdit) {
             displayContent = entry.content.replace('[EDIT] ', '');
              title = 'Description Edit';
              // Keep default edit icon
        }


        return (
            <div key={`${item.id}-hist-${index}`} className="mb-4 border-l-2 pl-3 border-border text-sm">
                <p className="text-muted-foreground text-xs mb-1 flex items-center">
                    <Clock size={12} className="inline mr-1" />
                    {format(entry.timestamp, "PPP p")}
                    <span className="ml-2 flex items-center">
                        {icon} {title}
                    </span>
                </p>
                <p className={cn("whitespace-pre-wrap", isStatusChange || isScheduleChange || isReminderChange || isDueChange || isSkipChange ? 'italic text-muted-foreground' : '')}>
                    {displayContent || (isEdit ? <i>(empty)</i> : '')}
                </p>
            </div>
        );
    };

    // Corrected: The TooltipProvider should wrap the entire component content
    return (
        <TooltipProvider delayDuration={100}>
            <main className="container mx-auto p-4 md:p-8">
                <header className="flex items-center mb-6 gap-4">
                    <Button variant="outline" size="icon" onClick={() => router.back()}>
                        <ArrowLeft size={16} />
                    </Button>
                    <h1 className="text-3xl font-bold text-primary">History & Analysis</h1>
                </header>

                {/* Analysis Charts Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Bar Chart Card (Horizontal) */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Task Duration Analysis</CardTitle>
                            <CardDescription>Expected vs. Actual duration and delays (days).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {barChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300 + barChartData.length * 10}> {/* Adjust height dynamically */}
                                    <BarChart
                                        data={barChartData}
                                        layout="vertical" // Set layout to vertical for horizontal bars
                                        margin={{ top: 5, right: 30, left: 5, bottom: 5 }} // Adjust margins, esp. right for labels
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                                        <XAxis type="number" label={{ value: 'Days', position: 'insideBottom', offset: -5, fontSize: '0.8rem' }} tick={{ fontSize: '0.75rem' }} />
                                        <YAxis
                                            dataKey="hierarchicalName" // Use the indented name
                                            type="category"
                                            width={150} // Increase width to accommodate longer/indented names
                                            tick={{ fontSize: '0.75rem', width: 140 }} // Adjust tick font size and width
                                            interval={0} // Show all ticks
                                        />
                                        <RechartsTooltip content={<CustomTooltip />} cursor={{fill: 'hsl(var(--muted))'}}/>
                                        <Legend wrapperStyle={{fontSize: '0.8rem'}}/>
                                        <Bar dataKey="durationExpected" name="Expected" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                                        <Bar dataKey="durationActual" name="Actual" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                                        <Bar dataKey="delay" name="Delay" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">No task data for duration analysis.</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Pie Chart Card (Activity Status) */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Activity Status Distribution</CardTitle>
                            <CardDescription>Proportion of current activities by status.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {pieChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={pieChartData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            outerRadius={100}
                                            fill="#8884d8" // Default fill, overridden by Cell
                                            dataKey="value"
                                        >
                                            {pieChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{fontSize: '0.8rem'}} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">No activity data for status analysis.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>


                {/* Item History Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Item History</CardTitle>
                        <CardDescription>Track changes made to descriptions and statuses.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {itemsWithHistory.length > 0 ? (
                            <ScrollArea className="h-[400px] pr-4"> {/* Add ScrollArea */}
                                {itemsWithHistory.map(item => (
                                    <Card key={item.id} className="mb-4">
                                        <CardHeader className="pb-2 pt-4">
                                            <CardTitle className="text-base flex items-center gap-2">
                                                <span className={cn("w-2 h-2 rounded-full",
                                                item.priority === 'high' ? 'bg-destructive' : item.priority === 'medium' ? 'bg-primary' : 'bg-success'
                                                )}></span>
                                                {item.name}
                                                <span className="text-xs font-normal text-muted-foreground ml-auto">
                                                    ({('listId' in item) ? 'Task' : ('activities' in item) ? 'Subtask' : 'Activity'}) - Status: {item.status}
                                                </span>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="mb-3 border rounded p-3 bg-secondary/30">
                                                <p className="text-muted-foreground text-xs mb-1">
                                                    <Clock size={12} className="inline mr-1" />
                                                    {item.lastEditedDate ? format(item.lastEditedDate, "PPP p") : 'Unknown edit date'} (Current version)
                                                </p>
                                                <p className="whitespace-pre-wrap text-sm">{item.description || <i>(empty)</i>}</p>
                                            </div>
                                            <h4 className="text-sm font-medium mb-2 text-muted-foreground">Previous Versions & Status Changes:</h4>
                                            {item.descriptionHistory && item.descriptionHistory.length > 0 ? (
                                                item.descriptionHistory
                                                .slice() // Create a copy to reverse without mutating original
                                                .reverse() // Show most recent first
                                                .map((entry, index) => renderHistoryEntry(entry, index, item))
                                            ) : (
                                                <p className="text-xs text-muted-foreground italic">No previous versions or status changes recorded.</p>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </ScrollArea>
                        ) : (
                            <p className="text-center text-muted-foreground py-4">No history found for any items.</p>
                        )}
                    </CardContent>
                </Card>

            </main>
        </TooltipProvider>
    );
}
