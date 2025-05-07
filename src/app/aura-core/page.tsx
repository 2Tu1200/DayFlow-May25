// src/app/aura-core/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Brain, Moon, Sun, Lightbulb, CalendarDays, Plus, Trash2, Timer, Play, Pause, RotateCcw, Leaf, Wind, X as CloseIcon } from 'lucide-react';
import useTaskStore from '@/hooks/use-task-store';
import type { Activity } from '@/lib/types';

interface AuraPageActivity {
  id: string;
  text: string;
  completed: boolean;
}

const AuraCorePage: React.FC = () => {
  const router = useRouter();
  const [theme, setTheme] = useState('light');
  const [currentDate, setCurrentDate] = useState('');
  const [auraActivities, setAuraActivities] = useState<AuraPageActivity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [auraActivitiesLoaderVisible, setAuraActivitiesLoaderVisible] = useState(true);

  const [timerTime, setTimerTime] = useState(25 * 60); // 25 minutes
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFocusSession, setIsFocusSession] = useState(true); // true for focus, false for break
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const FOCUS_DURATION = 25 * 60;
  const BREAK_DURATION = 5 * 60;

  const [wellBeingNudge, setWellBeingNudge] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info'; visible: boolean } | null>(null);

  const allMainActivities = useTaskStore(state => 
    state.getAllItems().filter(item => 
      !('listId' in item) && // Not a Task
      !('subtasks' in item) && // Not a Task (again, more specific)
      !('activities' in item) && // Not a Subtask
      ('parentId' in item) && // Must have parentId (characteristic of Activity)
      ('status' in item) // Must have status (characteristic of Activity)
    ) as Activity[]
  );


  const wellBeingMessages = [
    "Remember to stretch and hydrate regularly. Your body and mind will thank you!",
    "A quick walk can boost creativity. Consider stepping away for a few minutes.",
    "Deep breaths help reduce stress. Try a 1-minute breathing exercise.",
    "How's your posture? Sit up straight and relax your shoulders.",
    "Looking at a screen for too long? Try the 20-20-20 rule: every 20 mins, look at something 20 feet away for 20 secs."
  ];

  // --- Utility Functions ---
  const showAppMessage = (text: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
    setMessage({ text, type, visible: true });
    setTimeout(() => {
      setMessage(prev => prev ? { ...prev, visible: false } : null);
    }, duration);
  };

  // --- Theme Management ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('auraTheme') || 'light';
    setTheme(savedTheme);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('auraTheme', newTheme);
    document.documentElement.classList.toggle('dark');
    showAppMessage(`Switched to ${newTheme} mode`, 'info', 1500);
  };

  // --- Date and Time ---
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentDate(now.toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }));
    };
    updateDateTime();
    const intervalId = setInterval(updateDateTime, 60000); // Update time every minute
    return () => clearInterval(intervalId);
  }, []);

  // --- Aura Activities Management ---
  useEffect(() => {
    setAuraActivitiesLoaderVisible(true);
    setTimeout(() => { // Simulate loading
        try {
            const storedAuraActivities = localStorage.getItem('auraCoreActivities');
            if (storedAuraActivities) {
                setAuraActivities(JSON.parse(storedAuraActivities));
            }
        } catch (error) {
            console.error("Failed to parse Aura Core activities from localStorage", error);
            setAuraActivities([]); // Fallback to empty array on error
        }
        setAuraActivitiesLoaderVisible(false);
    }, 500);
  }, []);

  useEffect(() => {
    if (auraActivities.length > 0 || !auraActivitiesLoaderVisible) { 
        localStorage.setItem('auraCoreActivities', JSON.stringify(auraActivities));
    }
  }, [auraActivities, auraActivitiesLoaderVisible]);

  const handleAddSelectedAuraActivity = () => {
    if (!selectedActivityId) {
      showAppMessage('Please select an activity to add.', 'error');
      return;
    }
    const activityToAdd = allMainActivities.find(act => act.id === selectedActivityId);
    if (!activityToAdd) {
      showAppMessage('Selected activity not found.', 'error');
      return;
    }

    setAuraActivities(prevActivities => [
      ...prevActivities, 
      { id: crypto.randomUUID(), text: activityToAdd.name, completed: false }
    ]);
    setSelectedActivityId(null); // Reset selection
    showAppMessage(`Activity "${activityToAdd.name}" added to Aura Core!`, 'success');
  };

  const toggleAuraActivityCompletion = (id: string) => {
    setAuraActivities(prevActivities =>
      prevActivities.map(activity =>
        activity.id === id ? { ...activity, completed: !activity.completed } : activity
      )
    );
    const activity = auraActivities.find(a => a.id === id);
    if (activity) {
        showAppMessage(activity.completed ? 'Activity marked incomplete.' : 'Activity marked complete!', 'info', 1500);
    }
  };

  const deleteAuraActivity = (id: string) => {
    setAuraActivities(prevActivities => prevActivities.filter(activity => activity.id !== id));
    showAppMessage('Activity removed from Aura Core!', 'success');
  };

  // --- Focus Timer ---
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (isTimerRunning && timerTime > 0) {
      timerIntervalRef.current = setTimeout(() => {
        setTimerTime(prevTime => prevTime - 1);
      }, 1000);
    } else if (timerTime === 0) {
      setIsTimerRunning(false);
      if (timerIntervalRef.current) clearTimeout(timerIntervalRef.current);

      if (isFocusSession) {
        showAppMessage('Focus session complete! Time for a break.', 'success', 5000);
        setTimerTime(BREAK_DURATION);
        setIsFocusSession(false);
      } else {
        showAppMessage('Break over! Ready for another focus session?', 'success', 5000);
        setTimerTime(FOCUS_DURATION);
        setIsFocusSession(true);
      }
    }
    return () => {
      if (timerIntervalRef.current) clearTimeout(timerIntervalRef.current);
    };
  }, [isTimerRunning, timerTime, isFocusSession]);

  const handleStartPauseTimer = () => {
    setIsTimerRunning(!isTimerRunning);
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    if (timerIntervalRef.current) clearTimeout(timerIntervalRef.current);
    setIsFocusSession(true);
    setTimerTime(FOCUS_DURATION);
    showAppMessage('Timer reset.', 'info');
  };


  // --- Well-being ---
  useEffect(() => {
    const updateWellBeingMessage = () => {
      const randomIndex = Math.floor(Math.random() * wellBeingMessages.length);
      setWellBeingNudge(wellBeingMessages[randomIndex]);
    };
    updateWellBeingMessage();
    const intervalId = setInterval(updateWellBeingMessage, 5 * 60 * 1000); // Update every 5 minutes
    return () => clearInterval(intervalId);
  }, []);

  const handleMindfulness = () => {
    showAppMessage('Take a minute to close your eyes, breathe deeply, and center yourself.', 'info', 10000);
  };

  // --- Initialization ---
  useEffect(() => {
    showAppMessage('Welcome to Aura Core!', 'info', 2000);
  }, []);

  return (
    <>
      <style jsx global>{`
        /* Custom scrollbar for a cleaner look */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background-color: #4a5568; /* Tailwind gray-600 */
            border-radius: 10px;
            border: 2px solid transparent;
            background-clip: content-box;
        }
        .dark ::-webkit-scrollbar-thumb {
            background-color: #718096; /* Tailwind gray-500 */
        }

        body {
            font-family: 'Inter', sans-serif;
        }
        .task-item.completed label span { /* Updated from .task-item to be generic */
            text-decoration: line-through;
            opacity: 0.6;
        }
        .loader {
            border: 4px solid #f3f3f3; /* Light grey */
            border-top: 4px solid #6366f1; /* Indigo */
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .message-box {
            position: fixed;
            top: 1.25rem; /* Equivalent to top-5 */
            right: 1.25rem; /* Equivalent to right-5 */
            padding: 1rem; /* Equivalent to p-4 */
            border-radius: 0.5rem; /* Equivalent to rounded-lg */
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); /* Equivalent to shadow-xl */
            color: white;
            z-index: 50;
            transition: all 0.3s ease-in-out;
            opacity: 0;
            transform: translateY(-20px);
            visibility: hidden;
        }
        .message-box.show {
            opacity: 1;
            transform: translateY(0);
            visibility: visible;
        }
        .message-box-success { background-color: #22c55e; /* green-500 */ }
        .message-box-error { background-color: #ef4444; /* red-500 */ }
        .message-box-info { background-color: #3b82f6; /* blue-500 */ }
      `}</style>

      {message && message.visible && (
        <div className={cn("message-box show", {
          'message-box-success': message.type === 'success',
          'message-box-error': message.type === 'error',
          'message-box-info': message.type === 'info',
        })}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-4 font-bold"><CloseIcon size={18}/></button>
        </div>
      )}

      <div className="w-full max-w-5xl mx-auto p-4 md:p-8 bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.back()} aria-label="Go back">
              <ArrowLeft />
            </Button>
            <h1 className="text-3xl md:text-4xl font-bold text-primary flex items-center">
              <Brain className="mr-2" size={36} />Aura Core
            </h1>
          </div>
          <Button onClick={toggleTheme} variant="outline" size="icon" className="text-xl" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <section className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">Today's Briefing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400 mb-2">{currentDate || 'Loading date...'}</p>
                <p className="text-gray-600 dark:text-gray-400 flex items-center">
                  <Lightbulb className="mr-1 text-yellow-500" />
                  Focus on what matters. Let Aura guide your flow.
                </p>
                <div className="mt-4">
                  <h3 className="text-lg font-medium mb-2">Upcoming (Demo)</h3>
                  <div className="p-3 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center">
                    <CalendarDays className="mr-2 text-primary" /> Team Sync Meeting at 3:00 PM
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">My Activities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-2">
                  <Select value={selectedActivityId || ''} onValueChange={setSelectedActivityId}>
                    <SelectTrigger className="flex-grow">
                      <SelectValue placeholder="Select an activity to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allMainActivities.length === 0 && (
                        <SelectItem value="no-activities" disabled>No activities available</SelectItem>
                      )}
                      {allMainActivities.map(activity => (
                        <SelectItem key={activity.id} value={activity.id}>
                          {activity.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddSelectedAuraActivity} className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!selectedActivityId}>
                    <Plus className="mr-1" size={18}/> Add Activity
                  </Button>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {auraActivitiesLoaderVisible && <div className="loader"></div>}
                  {!auraActivitiesLoaderVisible && auraActivities.length === 0 && (
                    <p className="text-gray-500 dark:text-gray-400">No activities added yet. Select one above!</p>
                  )}
                  {!auraActivitiesLoaderVisible && auraActivities.map((activity) => (
                    <div key={activity.id} className={cn(
                      "task-item flex items-center justify-between p-3 rounded-lg transition-all", // kept .task-item class for style consistency
                      activity.completed ? 'bg-green-100 dark:bg-green-900/50 completed' : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50'
                    )}>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`aura-activity-${activity.id}`}
                          checked={activity.completed}
                          onChange={() => toggleAuraActivityCompletion(activity.id)}
                          className="mr-3 h-5 w-5 text-primary border-gray-300 dark:border-gray-600 rounded focus:ring-primary dark:focus:ring-primary/80 bg-white dark:bg-gray-700"
                        />
                        <label htmlFor={`aura-activity-${activity.id}`} className="cursor-pointer flex-grow">
                          <span className="text-gray-800 dark:text-gray-200">{activity.text}</span>
                        </label>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteAuraActivity(activity.id)} className="text-destructive hover:text-destructive/80 dark:hover:text-destructive/70" aria-label="Delete activity from Aura Core">
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold flex items-center mb-3">
                  <Timer className="mr-2 text-green-500 dark:text-green-400" />Focus Hub
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold text-center my-6 text-green-600 dark:text-green-400">{formatTime(timerTime)}</div>
                <div className="flex justify-center gap-3 mb-4">
                  <Button onClick={handleStartPauseTimer} className={cn("w-1/2", isTimerRunning ? "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
                    {isTimerRunning ? <Pause className="mr-1" /> : <Play className="mr-1" />} {isTimerRunning ? 'Pause' : (timerTime < (isFocusSession ? FOCUS_DURATION : BREAK_DURATION) && timerTime > 0 ? 'Resume' : (isFocusSession ? 'Start Focus' : 'Start Break'))}
                  </Button>
                  <Button onClick={handleResetTimer} variant="secondary" className="w-1/2">
                    <RotateCcw className="mr-1" /> Reset
                  </Button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  Tip: Use 25-min focus sprints with 5-min breaks.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold flex items-center mb-3">
                  <Leaf className="mr-2 text-teal-500 dark:text-teal-400" />Well-being Nudge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {wellBeingNudge}
                </p>
                <Button onClick={handleMindfulness} variant="secondary" className="mt-4 w-full">
                  <Wind className="mr-1" /> 1-Min Mindfulness
                </Button>
              </CardContent>
            </Card>
          </section>
        </main>

        <footer className="text-center mt-12 py-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aura Core Prototype &copy; {new Date().getFullYear()}. For demonstration purposes.
          </p>
        </footer>
      </div>
    </>
  );
};

export default AuraCorePage;
