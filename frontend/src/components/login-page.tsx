import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

// TODO: Move to a proper AuthContext
export function LoginPage({ onLoginSuccess }: { onLoginSuccess: (user: any) => void }) {
    const [error, setError] = useState<string | null>(null);

    const handleSuccess = async (credentialResponse: CredentialResponse) => {
        try {
            if (!credentialResponse.credential) return;

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: credentialResponse.credential }),
            });

            if (!res.ok) {
                throw new Error('Login failed on backend');
            }

            const data = await res.json();
            onLoginSuccess(data);
        } catch (err: any) {
            setError(err.message || 'Login Failed');
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900">
            <Card className="w-[350px]">
                <CardHeader>
                    <CardTitle>KiCAD Prism</CardTitle>
                    <CardDescription>Sign in to access hardware designs</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <GoogleLogin
                        onSuccess={handleSuccess}
                        onError={() => setError('Login Failed')}
                        useOneTap
                        auto_select
                    />
                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="relative w-full">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Or
                            </span>
                        </div>
                    </div>
                    {/* Dev Bypass for demonstration if Client ID is invalid */}
                    <button
                        onClick={() => {
                            window.history.replaceState(null, '', '/');
                            onLoginSuccess({ name: 'Dev User', email: 'dev@pixxel.co.in' });
                        }}
                        className="text-xs text-blue-500 underline"
                    >
                        Dev Bypass (Click if Auth fails)
                    </button>
                </CardContent>
            </Card>
        </div>
    );
}
