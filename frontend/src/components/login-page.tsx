import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';
import { Binary } from 'lucide-react';

interface LoginPageProps {
    onLoginSuccess: (user: any) => void;
    devMode?: boolean;
}

declare const __APP_VERSION__: string;

export function LoginPage({ onLoginSuccess, devMode = false }: LoginPageProps) {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSuccess = async (credentialResponse: CredentialResponse) => {
        try {
            setIsLoading(true);
            setError(null);

            if (!credentialResponse.credential) {
                setError('No credentials received from Google');
                return;
            }

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: credentialResponse.credential }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Login failed');
            }

            const data = await res.json();
            onLoginSuccess(data);
        } catch (err: any) {
            setError(err.message || 'Login Failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDevBypass = () => {
        window.history.replaceState(null, '', '/');
        onLoginSuccess({ name: 'Dev User', email: 'dev@pixxel.co.in' });
    };

    return (
        <div className="flex min-h-screen bg-background">
            {/* Left Side: Branding & Visuals */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden bg-slate-900 border-r">
                {/* Background Pattern */}
                <div className="absolute inset-0 z-0 opacity-10">
                    <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary/40" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                </div>

                <div className="relative z-10 flex flex-col justify-between p-12 w-full text-white">
                    <div className="flex items-center gap-4">
                        <img src="/logo.png" alt="KiCAD Prism Logo" className="w-10 h-10 object-contain" />
                        <span className="text-2xl font-bold tracking-tight">KiCAD Prism</span>
                    </div>

                    <div className="max-w-md">
                        <h1 className="text-5xl font-extrabold tracking-tight mb-6 leading-tight">
                            <span className="text-primary">Visualizing</span> <br />KiCAD Projects.
                        </h1>
                        <p className="text-lg text-slate-400 mb-8">
                            A web-based platform for viewing, reviewing, and collaborating on KiCAD projects.
                        </p>
                    </div>

                    <div className="flex items-center gap-4 text-slate-500 text-sm">
                        <Binary className="w-4 h-4" />
                        <span>{__APP_VERSION__}</span>
                        <div className="h-4 w-px bg-slate-800"></div>
                        <span>KiCAD-Prism Project</span>
                    </div>
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-slate-50 dark:bg-slate-950">
                <div className="w-full max-w-[360px] relative z-10 transition-all duration-700 ease-out animate-in fade-in slide-in-from-bottom-4">
                    <div className="lg:hidden flex flex-col items-center mb-10 gap-4">
                        <img src="/logo.png" alt="KiCAD Prism Logo" className="w-16 h-16 object-contain" />
                        <h2 className="text-3xl font-bold tracking-tight text-center">KiCAD Prism</h2>
                    </div>

                    <Card className="border-none shadow-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800">
                        <CardHeader className="space-y-1 pb-6 text-center lg:text-left">
                            <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
                            <CardDescription className="text-slate-500 dark:text-slate-400">
                                Access your KiCAD Workspace
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-center transition-transform hover:scale-[1.01]">
                                    <GoogleLogin
                                        onSuccess={handleSuccess}
                                        onError={() => setError('Google Sign-in failed')}
                                        useOneTap
                                        auto_select
                                        theme="outline"
                                        shape="pill"
                                        size="large"
                                        width="100%"
                                    />
                                </div>

                                {isLoading && (
                                    <div className="flex items-center justify-center gap-2 py-2">
                                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Authenticating...</span>
                                    </div>
                                )}

                                {error && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg">
                                        <p className="text-xs text-red-600 dark:text-red-400 text-center font-medium">{error}</p>
                                    </div>
                                )}
                            </div>

                            {devMode && (
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                        onClick={handleDevBypass}
                                        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all"
                                    >
                                        <Binary className="w-3.5 h-3.5" />
                                        Skip Authentication (Dev Mode)
                                    </button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <footer className="mt-12 text-center lg:text-left">
                        <p className="text-[10px] text-slate-400 dark:text-slate-600 font-medium uppercase tracking-widest">
                            Self-Hosted Tooling • Restricted Access
                        </p>
                    </footer>
                </div>
            </div>
        </div>
    );
}
