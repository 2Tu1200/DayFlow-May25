// src/app/page.tsx
'use client'; // Required for Zustand and DndContext

import React, { useState } from 'react';
import useTaskStore from '@/hooks/use-task-store';
import TaskList from '@/components/task-list'; // Corrected import path
import ExportDialog from '@/components/export-dialog'; // Import ExportDialog
import TodayView from '@/components/today-view'; // Import TodayView
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Import Input for Dialog
import { Label } from '@/components/ui/label'; // Import Label for Dialog
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose, // Import DialogClose
} from '@/components/ui/dialog'; // Import Dialog components
import { Plus, History, Download, CalendarCheck, ArrowLeft } from 'lucide-react'; // Added ArrowLeft icon
import { useRouter } from 'next/navigation'; // Import useRouter
import { cn } from '@/lib/utils';

export default function Home() {
  // Select necessary state and actions from the store
  const taskLists = useTaskStore(state => state.taskLists);
  const addTaskList = useTaskStore(state => state.addTaskList);
  const router = useRouter(); // Initialize router
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false); // State for export dialog
  const [isAddListDialogOpen, setIsAddListDialogOpen] = useState(false); // State for add list dialog
  const [newListName, setNewListName] = useState(''); // State for new list name input
  const [viewMode, setViewMode] = useState<'all' | 'today'>('all'); // State for view mode

  const handleAddListConfirm = () => {
      const trimmedName = newListName.trim();
      if (trimmedName) {
          addTaskList(trimmedName); // Call the action selected from the hook
          setNewListName(''); // Reset input
          setIsAddListDialogOpen(false); // Close dialog
      }
  };

  const handleAddListCancel = () => {
      setNewListName(''); // Reset input
      setIsAddListDialogOpen(false); // Close dialog
  }

  const handleGoToHistory = () => {
      router.push('/history'); // Navigate to the history page
  };

  const toggleViewMode = () => {
      setViewMode(current => current === 'all' ? 'today' : 'all');
  };

  return (
    <main className="container mx-auto p-4 md:p-8">
       <header className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap"> {/* Group title and action buttons */}
                <h1 className="text-3xl font-bold text-primary">DayFlow</h1>
                 <Button
                     onClick={toggleViewMode}
                     variant={viewMode === 'today' ? 'default' : 'outline'} // Highlight if active
                     size="sm"
                     className="transition-colors"
                 >
                    {viewMode === 'today' ? (
                        <>
                            <ArrowLeft size={16} className="mr-2" /> All Tasks
                        </>
                    ) : (
                         <>
                            <CalendarCheck size={16} className="mr-2" /> Today
                         </>
                    )}
                 </Button>
                 <Button onClick={handleGoToHistory} variant="outline" size="sm">
                    <History size={16} className="mr-2" /> History
                 </Button>
                 <Button onClick={() => setIsExportDialogOpen(true)} variant="outline" size="sm">
                     <Download size={16} className="mr-2" /> Export
                 </Button>
            </div>
            {/* Add List Button triggers Dialog */}
            <Dialog open={isAddListDialogOpen} onOpenChange={setIsAddListDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm">
                        <Plus size={16} className="mr-2" /> Add List
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                    <DialogTitle>Add New Task List</DialogTitle>
                    <DialogDescription>
                        Enter a name for your new task list.
                    </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="list-name" className="text-right">
                        Name
                        </Label>
                        <Input
                            id="list-name"
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            className="col-span-3"
                            placeholder="e.g., Work Projects"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddListConfirm()}} // Allow Enter to submit
                        />
                    </div>
                    </div>
                    <DialogFooter>
                        {/* Use DialogClose for Cancel */}
                         <DialogClose asChild>
                             <Button type="button" variant="outline" onClick={handleAddListCancel}>
                                Cancel
                            </Button>
                         </DialogClose>
                        <Button type="button" onClick={handleAddListConfirm} disabled={!newListName.trim()}>
                            Add List
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
       </header>

       {/* Content Area */}
       <div className="mt-6">
           {viewMode === 'today' ? (
               <TodayView />
           ) : (
               taskLists.length > 0 ? (
                  taskLists.map((list) => (
                     <TaskList key={list.id} list={list} />
                 ))
               ) : (
                  <div className="text-center py-10 text-muted-foreground">
                     <p>No task lists yet. Create one to get started!</p>
                      {/* Button to trigger the dialog */}
                     <Dialog open={isAddListDialogOpen} onOpenChange={setIsAddListDialogOpen}>
                        <DialogTrigger asChild>
                             <Button className="mt-4">
                                <Plus size={16} className="mr-2" /> Create First List
                            </Button>
                        </DialogTrigger>
                         {/* Dialog content remains the same as above */}
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                            <DialogTitle>Add New Task List</DialogTitle>
                            <DialogDescription>
                                Enter a name for your new task list.
                            </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="list-name-empty" className="text-right">
                                Name
                                </Label>
                                <Input
                                    id="list-name-empty"
                                    value={newListName}
                                    onChange={(e) => setNewListName(e.target.value)}
                                    className="col-span-3"
                                    placeholder="e.g., Personal Errands"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddListConfirm()}}
                                />
                            </div>
                            </div>
                            <DialogFooter>
                                 <DialogClose asChild>
                                    <Button type="button" variant="outline" onClick={handleAddListCancel}>
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button type="button" onClick={handleAddListConfirm} disabled={!newListName.trim()}>
                                    Add List
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                  </div>
               )
           )}
       </div>


      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
      />
    </main>
  );
}
