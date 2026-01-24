import { useState } from 'react';
import {
  Calendar,
  Plus,
  Trash2,
  Clock,
  Repeat,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useSharedCalendar } from '../../hooks/useSharedCalendar';
import type { CalendarEvent } from '../../types/friends';

export function CalendarTab() {
  const {
    events,
    isLoading,
    createEvent,
    deleteEvent,
    todayEvents,
    thisWeekEvents,
  } = useSharedCalendar();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;

    setIsSubmitting(true);
    try {
      const datetime = new Date(`${newDate}T${newTime || '00:00'}`).getTime();
      await createEvent({
        title: newTitle,
        description: newDescription || undefined,
        datetime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reminder_minutes: 30,
        is_recurring: isRecurring,
        recurrence_pattern: isRecurring ? 'weekly' : undefined,
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewDate('');
      setNewTime('');
      setIsRecurring(false);
    } catch (err) {
      console.error('Failed to create event:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (window.confirm('Delete this event?')) {
      await deleteEvent(eventId);
    }
  };

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const getEventsForDay = (day: number) => {
    return events.filter((event) => {
      const eventDate = new Date(event.datetime);
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() === currentMonth.getMonth() &&
        eventDate.getFullYear() === currentMonth.getFullYear()
      );
    });
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear()
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Calendar View */}
      <div className="lg:col-span-2">
        <div className="glass-elevated rounded-xl p-6">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="btn btn-ghost p-2">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-medium text-text-primary">
              {currentMonth.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </h3>
            <button onClick={nextMonth} className="btn btn-ghost p-2">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="text-center text-xs text-text-tertiary py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before the 1st */}
            {Array.from({ length: getFirstDayOfMonth(currentMonth) }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square p-1" />
            ))}

            {/* Day cells */}
            {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDay(day);
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={day}
                  className={`aspect-square p-1 rounded-lg transition-colors ${
                    isToday(day)
                      ? 'bg-indigo-500/20 border border-indigo-500/50'
                      : hasEvents
                      ? 'bg-white/5'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div
                    className={`text-xs font-medium ${
                      isToday(day) ? 'text-indigo-400' : 'text-text-primary'
                    }`}
                  >
                    {day}
                  </div>
                  {hasEvents && (
                    <div className="mt-0.5">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className="text-xs truncate text-pink-400"
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-xs text-text-tertiary">
                          +{dayEvents.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Add Event Button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>

        {/* Today's Events */}
        <div className="glass-elevated rounded-xl p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Today
          </h4>
          {todayEvents.length > 0 ? (
            <div className="space-y-2">
              {todayEvents.map((event) => (
                <EventCard key={event.id} event={event} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No events today</p>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="glass-elevated rounded-xl p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            This Week
          </h4>
          {thisWeekEvents.length > 0 ? (
            <div className="space-y-2">
              {thisWeekEvents.slice(0, 5).map((event) => (
                <EventCard key={event.id} event={event} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No events this week</p>
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-elevated rounded-xl p-6 w-full max-w-md m-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-text-primary">Add Event</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-ghost p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Title */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Event Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="input w-full"
                  placeholder="e.g., Co-op Domain Night"
                  required
                />
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="input w-full resize-none"
                  rows={2}
                  placeholder="Add details..."
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Time
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Recurring */}
              <div className="mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  <span className="text-sm text-text-secondary">
                    Repeat weekly
                  </span>
                </label>
              </div>

              {/* Submit */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Add Event'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  onDelete,
}: {
  event: CalendarEvent;
  onDelete: (id: string) => void;
}) {
  const eventDate = new Date(event.datetime);

  return (
    <div className="glass rounded-lg p-3 group relative">
      <button
        onClick={() => onDelete(event.id)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
      >
        <Trash2 className="w-3 h-3 text-red-400" />
      </button>

      <div className="font-medium text-text-primary text-sm mb-1">{event.title}</div>
      <div className="flex items-center gap-2 text-xs text-text-tertiary">
        <Clock className="w-3 h-3" />
        {eventDate.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
        {event.is_recurring && (
          <>
            <Repeat className="w-3 h-3 ml-2" />
            <span>Weekly</span>
          </>
        )}
      </div>
    </div>
  );
}
