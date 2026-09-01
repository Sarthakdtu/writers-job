import React, { useState, Component } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { StoryProvider, useStory } from './context/StoryContext';
import { SkillLevelProvider, useSkillLevel } from './context/SkillLevelContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { AmbientBackground } from './components/AmbientBackground';
import { QuickSearchModal } from './components/QuickSearchModal';
import { AIPanel } from './components/AIPanel';
import { Minimize2, Feather, Lock } from 'lucide-react';

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
import { CreatorPipelineView } from './components/modules/CreatorPipelineView';
import { TrashView } from './components/modules/TrashView';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ExplorerPanel } from './components/ExplorerPanel';
import { SkillLevelModal } from './components/SkillLevelToggle';

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
  const { level } = useSkillLevel();
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [skillLevelSeen, setSkillLevelSeen] = useState(
    () => localStorage.getItem('loresmith_skill_level_seen') !== '1'
  );

  const closeSkillLevel = () => {
    localStorage.setItem('loresmith_skill_level_seen', '1');
    setSkillLevelSeen(false);
  };

  const renderActiveModule = () => {
    switch (activeTab) {
      // A lock: if the user's current level doesn't unlock this tab, fall back home.
      case 'world':
        return <LevelGate feature="nav.world" title="Worldbuilding Hub" hint="Level up to shape cities, factions & artifacts."><WorldbuildingView /></LevelGate>;
      case 'charmap':
        return <LevelGate feature="nav.charmap" title="Character Map" hint="Level up to explore the relationship graph."><CharacterMapView /></LevelGate>;
      case 'outliner':
        return <LevelGate feature="nav.outliner" title="Book Outliner" hint="Level up to shape your plot, beats & scenes."><BookOutlinerView /></LevelGate>;
      case 'editor':
        return <DraftEditorView />;
      case 'ai':
        return <LevelGate feature="nav.ai" title="Skill Studio" hint="Level up to Pro for the full AI suite."><SkillStudioView /></LevelGate>;
      case 'creator':
        return <LevelGate feature="nav.creator" title="Creator Pipeline" hint="Level up to Pro to import prose into a story."><CreatorPipelineView /></LevelGate>;
      case 'trash':
        return <TrashView />;
      case 'home':
        return <HomeView />;
      case 'dashboard':
        return <DashboardView />;
      case 'characters':
        return <CharacterRosterView />;
      case 'quotes':
        return <QuotesView />;
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
          key={level}
          className={`flex-1 overflow-y-auto transition-all skill-level-unlock ${
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

      {/* Universe Explorer (bottom-right widget + side panel) */}
      <ExplorerPanel />

      {/* Skill Level onboarding modal (shown once) */}
      {skillLevelSeen && <SkillLevelModal onDone={closeSkillLevel} />}
    </div>
  );
};

const LevelGate = ({ feature, title, hint, children }) => {
  const { canUse } = useSkillLevel();
  const { setActiveTab } = useStory();
  if (canUse(feature)) return children;
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
        <Lock className="h-6 w-6" />
      </span>
      <p className="text-sm text-[var(--text-muted)]">{title} unlocks at a higher skill level.</p>
      <p className="mt-1 text-xs text-[var(--text-dim)]">{hint}</p>
      <button
        onClick={() => setActiveTab('home')}
        className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
      >
        Back to Home
      </button>
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <StoryProvider>
        <SkillLevelProvider>
          <AppErrorBoundary>
            <MainLayout />
          </AppErrorBoundary>
        </SkillLevelProvider>
      </StoryProvider>
    </ThemeProvider>
  );
}
