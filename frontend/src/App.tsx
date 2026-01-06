import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/login-page';
import { Button } from '@/components/ui/button';
import { Workspace } from './components/workspace';
import { ProjectDetailPage } from './pages/ProjectDetailPage';

function App() {
    const [user, setUser] = useState<any>(null);

    if (!user) {
        return <LoginPage onLoginSuccess={setUser} />;
    }

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={
                    <div className="min-h-screen bg-background text-foreground">
                        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
                            <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-6 bg-primary rounded-md"></div>
                                    <span className="text-xl font-bold tracking-tight">KiCAD Prism</span>
                                </div>

                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-muted-foreground">Welcome, {user.name}</span>
                                    <Button variant="ghost" size="sm" onClick={() => setUser(null)}>Logout</Button>
                                </div>
                            </div>
                        </header>

                        <main className="container mx-auto px-6 py-8">
                            <Workspace />
                        </main>
                    </div>
                } />
                <Route path="/project/:projectId" element={<ProjectDetailPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;