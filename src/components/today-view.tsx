// src/components/today-view.tsx
'use client';

import React from 'react';
import useTaskStore, { TodayItem } from '@/hooks/use-task-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict, addDays } from 'date-fns';
import { AlertTriangle, ChevronRight, Clock, List, Play, CircleDotDashed, Check, CircleOff, ArrowLeft, Brain } from 'lucide-react'; // Added Brain for Aura Core
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';


// Priority styling using theme variables
const priorityStyles: Record<TodayItem['priority'], { border: string; bg: string; text: string }> = {
  high: { border: 'border-destructive', bg: 'bg-destructive/10', text: 'text-destructive' },
  medium: { border: 'border-primary', bg: 'bg-primary/10', text: 'text-primary' },
  low: { border: 'border-success', bg: 'bg-success/10', text: 'text-success' }, // Low priority included for overdue items
};

// Status icon mapping
const statusIcons: Record<TodayItem['status'], React.ElementType> = {
  todo: CircleOff,
  started: Play,
  inprogress: CircleDotDashed,
  done: Check, // Although done items are filtered out, include for completeness
};

// Helper to get status color class
const getStatusColor = (status: TodayItem['status']): string => {
    switch (status) {
        case 'todo': return 'text-muted-foreground';
        case 'started': return 'text-started';
        case 'inprogress': return 'text-inprogress';
        case 'done': return 'text-success';
        default: return 'text-muted-foreground';
    }
};


const TodayItemCard: React.FC<{ item: TodayItem }> = ({ item }) => {
  const priorityStyle = priorityStyles[item.priority];
  const StatusIcon = statusIcons[item.status];
  const statusColor = getStatusColor(item.status);

  const getDueDateText = () => {
    if (item.isOverdue) {
      return `Overdue by ${formatDistanceToNowStrict(item.expectedCompletionDate)}`;
    }
    if (item.daysUntilDue === 0) {
      return 'Due today';
    }
    return `Due in ${formatDistanceToNowStrict(addDays(new Date(), item.daysUntilDue))}`;
  };

  return (
     <TooltipProvider delayDuration={100}>
        <Card className={cn("mb-3 shadow-sm hover:shadow-md transition-shadow duration-200 relative border-l-4", priorityStyle.border, priorityStyle.bg)}>
             <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                    {/* Status Icon */}
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <StatusIcon size={16} className={cn("flex-shrink-0", statusColor)} />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Status: {item.status}</p>
                        </TooltipContent>
                    </Tooltip>

                    {/* Item Name and Hierarchy */}
                    <div className="flex-grow min-w-0">
                        <div className="text-sm font-medium truncate" title={item.name}>{item.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-1.5">
                            {item.listName && (
                                <>
                                    <List size={10} />
                                    <span>{item.listName}</span>
                                </>
                            )}
                             {item.taskName && (
                                <>
                                    <ChevronRight size={10} className="opacity-50" />
                                    <span>{item.taskName}</span>
                                </>
                            )}
                            {item.subtaskName && (
                                <>
                                    <ChevronRight size={10} className="opacity-50" />
                                    <span>{item.subtaskName}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Priority and Due Date */}
                <div className="flex items-center justify-between text-xs pl-6"> {/* Indent to align with name */}
                    <span className={cn("font-medium", priorityStyle.text)}>
                        {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)} Priority
                    </span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className={cn("flex items-center gap-1", item.isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                                <Clock size={12} />
                                <span>{getDueDateText()}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Expected: {format(item.expectedCompletionDate, 'PPP')}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
             </CardContent>
        </Card>
    </TooltipProvider>
  );
};


export default function TodayView() {
  const taskStore = useTaskStore();
  const router = useRouter();
  const todayItems = taskStore.getTodayItems();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>Today's Focus</CardTitle>
          <CardDescription>
            Prioritized tasks and activities needing attention based on priority and due dates.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/aura-core')}>
                 <Brain size={16} className="mr-2" /> Aura Core
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {todayItems.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-220px)] pr-4"> {/* Adjust height as needed */}
            {todayItems.map(item => (
              <TodayItemCard key={item.id} item={item} />
            ))}
          </ScrollArea>
        ) : (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>All Clear!</AlertTitle>
            <AlertDescription>
              No high or medium priority items are currently overdue or due soon.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
