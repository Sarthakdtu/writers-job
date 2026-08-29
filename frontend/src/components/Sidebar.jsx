import React from 'react';
import {
  Home,
  LayoutDashboard,
  Globe,
  Users,
  GitFork,
  FileText,
  Quote,
  ChevronLeft,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { useStory } from '../context/StoryContext';

export const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home, desc: 'All your stories & projects' },
  { id: 'dashboard', label: 'Story Dashboard', icon: LayoutDashboard, desc: 'Overview, facts & aesthetics' },
  { id: 'world', label: 'Worldbuilding Hub', icon: Globe, desc: 'Cities, mechanics, factions' },
  { id: 'characters', label: 'Character Roster', icon: Users, desc: 'Profiles & appearances matrix' },
  { id: 'outliner', label: 'Book Outliner', icon: GitFork, desc: 'Beats, arcs, scene breakdowns' },
  { id: 'editor', label: 'Draft Editor', icon: FileText, desc: 'Dual-mode Markdown & Google Docs' },
  { id: 'quotes', label: 'Quotes', icon: Quote, desc: 'Memorable lines, notes & tags' },
];

export const Sidebar = () => {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen, activeStory } = useStory();

  return (
    <aside
      className={`relative sticky top-[53px] h-[calc(100vh-53px)] border-r border-[var(--border-color)] bg-[var(--bg-panel)]/95 backdrop-blur-md transition-all duration-300 z-30 flex flex-col ${
        sidebarOpen ? 'w-64' : 'w-16'
      }`}
    >
      {/* Active Story Badge */}
      {sidebarOpen && activeStory && (
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
            Active Universe
          </div>
          <div className="font-prose text-base font-semibold truncate text-[var(--text-main)] mt-0.5">
            {activeStory.title}
          </div>
          {activeStory.tags && activeStory.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {activeStory.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-[var(--accent-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)] border border-[var(--border-subtle)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-md'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
              }`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <Icon
                className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-[var(--accent)]'
                }`}
              />
              {sidebarOpen && (
                <div className="truncate">
                  <div className="font-semibold leading-tight">{item.label}</div>
                  <div
                    className={`text-[11px] truncate mt-0.5 ${
                      isActive ? 'text-white/80' : 'text-[var(--text-dim)]'
                    }`}
                  >
                    {item.desc}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Collapse Toggle */}
      <div className="p-2 border-t border-[var(--border-subtle)] flex justify-end">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-full flex items-center justify-center gap-2 rounded-lg p-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors"
          title={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse Sidebar</span>
            </>
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
};
