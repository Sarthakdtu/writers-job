import React, { useState, Component } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { StoryProvider, useStory } from './context/StoryContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { AmbientBackground } from './components/AmbientBackground';
import { QuickSearchModal } from './components/QuickSearchModal';
import { AIPanel } from './components/AIPanel';
import { Minimize2, Feather } from 'lucide-react';

// Main Application Content Switcher placeholder modules
import { HomeView } from './components/modules/HomeView';
import { DashboardView } from './components/modules/DashboardView';
import { WorldbuildingView } from './components/modules/WorldbuildingView';
import { CharacterRosterView } from './components/modules/CharacterRosterView';
import { CharacterMapView } from './components/modules/CharacterMapView';
import { BookOutlinerView } from './components/modules/BookOutlinerView';
import { DraftEditorView } from './components/modules/DraftEditorView';
import { QuotesView } from './components/modules/QuotesView';
import { SkillStudioView } from './components/modules/SkillStudioView';
import { TrashView } from './components/modules/TrashView';
import { GoogleDriveModal } from './components/GoogleDriveModal';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-base)' }}>
          <div className="max-w-md w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center shadow-2xl">
            <p className="font-prose text-lg font-bold text-[var(--text-main)] mb-2">Something went wrong</p>
            <p className="text-xs text-[var(--text-muted)] mb-4">An unexpected error crashed this view. Reload the page; if it keeps happening, the message below will help us fix it.</p>
            <pre className="text-[11px] text-rose-400 bg-[var(--bg-base)] rounded-lg p-3 text-left overflow-auto whitespace-pre-wrap font-mono max-h-48">{String(this.state.error)}</pre>
            <button onClick={() => window.location.reload()} className="mt-4 rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ backgroundColor: 'var(--accent)' }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const MainLayout = () => {
  const { activeTab, focusMode, setFocusMode, aiPanelOpen, setAiPanelOpen } = useStory();
  const [showBackupModal, setShowBackupModal] = useState(false);

  const renderActiveModule = () => {
    switch (activeTab) {
      case 'home':
        return <HomeView />;
      case 'dashboard':
        return <DashboardView />;
      case 'world':
        return <WorldbuildingView />;
      case 'characters':
        return <CharacterRosterView />;
      case 'charmap':
        return <CharacterMapView />;
      case 'outliner':
        return <BookOutlinerView />;
      case 'editor':
        return <DraftEditorView />;
      case 'quotes':
        return <QuotesView />;
      case 'ai':
        return <SkillStudioView />;
      case 'trash':
        return <TrashView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <AmbientBackground />

      {/* Standard Navbar (Hidden in Focus Mode) */}
      {!focusMode && <Navbar onOpenBackupModal={() => setShowBackupModal(true)} />}

      <div className="flex-1 flex relative z-10">
        {/* Standard Sidebar (Hidden in Focus Mode) */}
        {!focusMode && <Sidebar />}

        {/* Focus Mode Header Banner */}
        {focusMode && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)]/90 backdrop-blur-md px-3 py-1.5 shadow-lg text-xs font-semibold text-[var(--text-muted)] animate-in fade-in">
            <Feather className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Focus Mode Active</span>
            <button
              onClick={() => setFocusMode(false)}
              className="ml-2 rounded-full p-1 hover:bg-[var(--bg-hover)] text-[var(--accent)]"
              title="Exit Focus Mode (Ctrl+Shift+F)"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main
          className={`flex-1 overflow-y-auto transition-all ${
            focusMode ? 'max-w-4xl mx-auto p-6 md:p-12' : 'p-4 md:p-8'
          }`}
        >
          {renderActiveModule()}
        </main>
      </div>

      {/* Global Quick Search Modal (Ctrl+K) */}
      <QuickSearchModal />

      {/* Google Drive Sync Modal */}
      {showBackupModal && <GoogleDriveModal onClose={() => setShowBackupModal(false)} />}

      {/* AI Assistant Panel (Ctrl+Shift+A) */}
      <AIPanel isOpen={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <StoryProvider>
        <AppErrorBoundary>
          <MainLayout />
        </AppErrorBoundary>
      </StoryProvider>
    </ThemeProvider>
  );
}
